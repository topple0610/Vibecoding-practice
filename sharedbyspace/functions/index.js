const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const net = require("node:net");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { defineSecret } = require("firebase-functions/params");

initializeApp();
const db = getFirestore();
const storage = getStorage();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });
const minimaxApiKey = defineSecret("MINIMAX_API_KEY");

const allowedTypes = new Set([
  "youtube", "tweet", "instagram", "article", "screenshot",
  "reference", "hook", "reaction", "idea"
]);

function requireUser(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }
  return request.auth.uid;
}

function verifiedIdentity(request) {
  const uid = requireUser(request);
  const email = safeText(request.auth.token.email, 320).toLowerCase();
  if (!email || request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "An approved verified email is required.");
  }
  return { uid, email };
}

async function requireMember(request) {
  const identity = verifiedIdentity(request);
  const { email } = identity;
  const member = await db.collection("approvedEmails").doc(email).get();
  if (!member.exists || member.data().active !== true) {
    throw new HttpsError("permission-denied", "This account is not approved for the library.");
  }
  return identity;
}

function safeText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HttpsError("invalid-argument", "A valid URL is required.");
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new HttpsError("invalid-argument", "Only HTTP links are supported.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  ) {
    throw new HttpsError("invalid-argument", "Local addresses are not supported.");
  }
  return url;
}

function typeFromUrl(url) {
  if (url.hostname === "youtu.be" || url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) return "youtube";
  if (url.hostname === "twitter.com" || url.hostname.endsWith(".twitter.com") || url.hostname === "x.com" || url.hostname.endsWith(".x.com")) return "tweet";
  if (url.hostname === "instagram.com" || url.hostname.endsWith(".instagram.com")) return "instagram";
  return "article";
}

function isPrivateAddress(address) {
  if (address.startsWith("::ffff:")) {
    return isPrivateAddress(address.slice(7));
  }
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224;
  }
  const lowered = address.toLowerCase();
  return lowered === "::" ||
    lowered === "::1" ||
    lowered.startsWith("fc") ||
    lowered.startsWith("fd") ||
    /^fe[89ab]/.test(lowered);
}

async function assertPublicHost(url) {
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new HttpsError("invalid-argument", "Private network URLs are not supported.");
  }
}

async function fetchPublicDocument(initialUrl) {
  let url = initialUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    await assertPublicHost(url);
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SharedBySpace/1.0; +https://sharedbyspace.web.app)" },
      redirect: "manual",
      signal: AbortSignal.timeout(6500)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect has no destination.");
      url = parseUrl(new URL(location, url).toString());
      continue;
    }
    return response;
  }
  throw new Error("Too many redirects.");
}

function unescapeHtml(value = "") {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;|&#8212;|&#x2014;/gi, " - ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function metaTag(html, keys) {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`, "i")
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return unescapeHtml(match[1]);
    }
  }
  return "";
}

function youtubeId(url) {
  if (url.hostname.includes("youtu.be")) return url.pathname.split("/")[1];
  return url.searchParams.get("v") || url.pathname.match(/\/shorts\/([^/?]+)/)?.[1] || "";
}

function xStatusId(url) {
  return url.pathname.match(/\/status\/(\d+)/)?.[1] || "";
}

async function jsonResponse(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SharedBySpace/1.0" },
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error(`Request returned ${response.status}`);
  return response.json();
}

function tweetTitle(html) {
  const content = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || html;
  return safeText(unescapeHtml(content), 220);
}

function isOnlyUrl(value = "") {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function compactText(value, max = 500) {
  return safeText(value, max).replace(/\s+/g, " ").trim();
}

function twimgUrl(value) {
  try {
    const url = new URL(safeText(value, 2000));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !hostname.endsWith("twimg.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function firstXImage(data = {}) {
  const media = Array.isArray(data.media_extended) ? data.media_extended : [];
  const firstMedia = media.find((item) => item?.type === "image") || media.find((item) => item?.thumbnail_url || item?.url);
  const mediaUrls = Array.isArray(data.mediaURLs) ? data.mediaURLs : [];
  return [
    firstMedia?.thumbnail_url,
    firstMedia?.url,
    mediaUrls[0],
    data.article?.image
  ].map(twimgUrl).find(Boolean) || "";
}

function stripReasoning(value) {
  return compactText(
    value
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*/i, ""),
    120
  );
}

function conciseFallbackTitle(value) {
  const text = compactText(value, 220);
  const markers = [" 如果", " 没有", " 支持", " 很多", "。", "！", "？", ". ", " - "];
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index >= 8 && index <= 80) return compactText(text.slice(0, index), 80);
  }
  return compactText(text, 80);
}

async function generateAiTitle(metadata) {
  let apiKey = "";
  try {
    apiKey = minimaxApiKey.value();
  } catch {
    apiKey = process.env.MINIMAX_API_KEY || "";
  }
  if (!apiKey) return "";

  const source = {
    url: metadata.url,
    type: metadata.type,
    currentTitle: metadata.title,
    author: metadata.author,
    sourceName: metadata.sourceName,
    description: metadata.description
  };
  const response = await fetch("https://api.minimaxi.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "MiniMax-M2.7-highspeed",
      messages: [
        {
          role: "system",
          name: "SharedBySpace",
          content: "Create one concise title for a private video-idea library. Use only the provided metadata. If currentTitle is a long social post, summarize the main idea instead of copying it. Keep the source language when possible. No quotes, no emoji, no hashtags, no explanation. Hard limit: 18 Chinese characters or 12 English words."
        },
        {
          role: "user",
          name: "User",
          content: JSON.stringify(source)
        }
      ],
      max_completion_tokens: 1024,
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`MiniMax returned ${response.status}`);
  const data = await response.json();
  return stripReasoning(data.choices?.[0]?.message?.content || "");
}

async function withAiTitle(url, metadata) {
  const title = await generateAiTitle({ url: url.toString(), ...metadata }).catch(() => "");
  return {
    ...metadata,
    title: title && title.length <= 90 ? title : conciseFallbackTitle(metadata.title)
  };
}

async function fetchPreview(url) {
  const type = typeFromUrl(url);
  if (type === "youtube") {
    const data = await jsonResponse(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`);
    const id = youtubeId(url);
    return withAiTitle(url, {
      type,
      title: safeText(data.title),
      author: safeText(data.author_name),
      sourceName: "YouTube",
      previewImage: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : safeText(data.thumbnail_url, 1000)
    });
  }
  if (type === "tweet") {
    const data = await jsonResponse(`https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(url.toString())}`);
    let xData = {};
    const statusId = xStatusId(url);
    if (statusId) {
      xData = await jsonResponse(`https://api.vxtwitter.com/i/status/${statusId}`).catch(() => ({}));
    }
    const text = compactText(xData.text, 220);
    const articleTitle = compactText(xData.article?.title, 220);
    return withAiTitle(url, {
      type,
      title: (text && !isOnlyUrl(text) ? text : articleTitle) || tweetTitle(data.html),
      author: safeText(data.author_name),
      sourceName: "X",
      previewImage: firstXImage(xData),
      description: compactText(xData.article?.description, 500)
    });
  }

  const response = await fetchPublicDocument(url);
  if (!response.ok) throw new Error(`Request returned ${response.status}`);
  const html = (await response.text()).slice(0, 300000);
  const sourceName = type === "instagram"
    ? "Instagram"
    : metaTag(html, ["og:site_name"]) || url.hostname.replace(/^www\./, "");
  return withAiTitle(url, {
    type,
    title: metaTag(html, ["og:title", "twitter:title"]) || safeText(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]),
    author: metaTag(html, ["author", "article:author", "twitter:creator"]) || sourceName,
    sourceName,
    previewImage: metaTag(html, ["og:image", "twitter:image"]),
    description: metaTag(html, ["og:description", "twitter:description", "description"])
  });
}

exports.enrichLink = onCall({ cors: true, invoker: "public", secrets: [minimaxApiKey] }, async (request) => {
  await requireMember(request);
  const url = parseUrl(safeText(request.data?.url, 2000));
  try {
    return await fetchPreview(url);
  } catch {
    return {
      type: typeFromUrl(url),
      title: "",
      author: "",
      sourceName: url.hostname.replace(/^www\./, ""),
      previewImage: ""
    };
  }
});

exports.claimWorkspaceOwner = onCall({ cors: true }, async (request) => {
  const identity = verifiedIdentity(request);
  const accessRef = db.collection("workspace").doc("access");
  const memberRef = db.collection("approvedEmails").doc(identity.email);

  await db.runTransaction(async (transaction) => {
    const access = await transaction.get(accessRef);
    if (access.exists && access.data().ownerEmail !== identity.email) {
      throw new HttpsError("failed-precondition", "Workspace owner already exists.");
    }
    const workspace = {
      ownerId: identity.uid,
      ownerEmail: identity.email
    };
    if (!access.exists || !access.data().initializedAt) {
      workspace.initializedAt = FieldValue.serverTimestamp();
    }
    transaction.set(accessRef, workspace, { merge: true });
    transaction.set(memberRef, {
      active: true,
      role: "owner",
      userId: identity.uid,
      approvedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  return { approved: true };
});

exports.createAgentToken = onCall({ cors: true }, async (request) => {
  const owner = await requireMember(request);
  const label = safeText(request.data?.label, 60) || "Agent";
  const token = `sbs_${crypto.randomBytes(30).toString("base64url")}`;
  const id = hashToken(token);
  await db.collection("agentTokens").doc(id).set({
    label,
    ownerId: owner.uid,
    ownerEmail: owner.email,
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: null,
    active: true
  });
  return { id, token };
});

exports.listAgentTokens = onCall({ cors: true }, async (request) => {
  const owner = await requireMember(request);
  const snapshot = await db.collection("agentTokens")
    .where("ownerId", "==", owner.uid)
    .get();
  return {
    tokens: snapshot.docs.filter((item) => item.data().active).map((item) => ({
      id: item.id,
      label: item.data().label,
      createdAt: item.data().createdAt || null
    }))
  };
});

exports.revokeAgentToken = onCall({ cors: true }, async (request) => {
  const owner = await requireMember(request);
  const id = safeText(request.data?.id, 100);
  const tokenDoc = db.collection("agentTokens").doc(id);
  const snapshot = await tokenDoc.get();
  if (!snapshot.exists || snapshot.data().ownerId !== owner.uid) {
    throw new HttpsError("not-found", "Credential not found.");
  }
  await tokenDoc.update({ active: false, revokedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

async function authenticateAgent(request) {
  const bearer = request.get("authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  if (!token) return null;
  const ref = db.collection("agentTokens").doc(hashToken(token));
  const snapshot = await ref.get();
  if (!snapshot.exists || !snapshot.data().active) return null;
  const ownerEmail = safeText(snapshot.data().ownerEmail, 320).toLowerCase();
  if (!ownerEmail) return null;
  const member = await db.collection("approvedEmails").doc(ownerEmail).get();
  if (!member.exists || member.data().active !== true) return null;
  await ref.update({ lastUsedAt: FieldValue.serverTimestamp() });
  return snapshot.data();
}

function ideaPayload(body, existing = {}) {
  const categories = Array.isArray(body.categories)
    ? body.categories.map((tag) => safeText(tag, 50)).filter(Boolean).slice(0, 20)
    : existing.categories || [];
  const type = allowedTypes.has(body.type) ? body.type : existing.type || "idea";
  return {
    title: body.title === undefined ? existing.title || "Untitled idea" : safeText(body.title, 220) || "Untitled idea",
    url: body.url === undefined ? existing.url || "" : safeText(body.url, 2000),
    notes: body.notes === undefined ? existing.notes || "" : safeText(body.notes, 4000),
    type,
    categories,
    filmDate: body.filmDate === undefined ? existing.filmDate || null : safeText(body.filmDate, 10) || null,
    previewImage: body.previewImage === undefined ? existing.previewImage || "" : safeText(body.previewImage, 2000),
    storagePath: existing.storagePath || "",
    author: body.author === undefined ? existing.author || "" : safeText(body.author, 150),
    updatedAt: FieldValue.serverTimestamp()
  };
}

async function enrichedPayload(body, existing = {}) {
  const payload = ideaPayload(body, existing);
  const shouldEnrich = payload.url && (
    body.url !== undefined || !payload.title || !payload.previewImage
  );
  if (!shouldEnrich) return payload;
  try {
    const metadata = await fetchPreview(parseUrl(payload.url));
    return {
      ...payload,
      type: body.type ? payload.type : metadata.type,
      title: body.title ? payload.title : metadata.title || payload.title,
      author: body.author ? payload.author : metadata.author || payload.author,
      previewImage: body.previewImage ? payload.previewImage : metadata.previewImage || payload.previewImage,
      sourceName: metadata.sourceName || existing.sourceName || ""
    };
  } catch {
    return payload;
  }
}

exports.agentApi = onRequest({ cors: false, secrets: [minimaxApiKey] }, async (request, response) => {
  const agent = await authenticateAgent(request);
  if (!agent) {
    response.status(401).json({ error: "A valid agent bearer token is required." });
    return;
  }

  const segments = request.path.split("/").filter(Boolean);
  if (segments[0] !== "ideas") {
    response.status(404).json({ error: "Use /ideas or /ideas/{id}." });
    return;
  }

  try {
    if (request.method === "GET" && !segments[1]) {
      const search = safeText(request.query.search, 100).toLowerCase();
      const category = safeText(request.query.category, 50);
      const snapshot = await db.collection("ideas").orderBy("createdAt", "desc").limit(200).get();
      const ideas = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((idea) => {
        const text = `${idea.title || ""} ${idea.notes || ""} ${idea.url || ""}`.toLowerCase();
        return (!search || text.includes(search)) && (!category || (idea.categories || []).includes(category));
      });
      response.json({ ideas });
      return;
    }

    if (request.method === "POST" && !segments[1]) {
      const payload = await enrichedPayload(request.body || {});
      const ref = await db.collection("ideas").add({
        ...payload,
        createdAt: FieldValue.serverTimestamp(),
        createdByAgent: agent.label
      });
      response.status(201).json({ id: ref.id });
      return;
    }

    const ideaId = segments[1];
    const ideaRef = db.collection("ideas").doc(ideaId);
    const existing = await ideaRef.get();
    if (!existing.exists) {
      response.status(404).json({ error: "Idea not found." });
      return;
    }
    if (request.method === "PATCH") {
      await ideaRef.update({
        ...await enrichedPayload(request.body || {}, existing.data()),
        updatedByAgent: agent.label
      });
      response.json({ ok: true });
      return;
    }
    if (request.method === "DELETE") {
      if (existing.data().storagePath) {
        await storage.bucket().file(existing.data().storagePath).delete().catch(() => {});
      }
      await ideaRef.delete();
      response.status(204).send("");
      return;
    }
    response.status(405).json({ error: "Method not supported." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "The operation failed." });
  }
});
