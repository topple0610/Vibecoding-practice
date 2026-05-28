import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  Film,
  ImagePlus,
  KeyRound,
  Link2,
  LogOut,
  PencilLine,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { onAuthStateChanged, signInWithRedirect, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, functions, provider, storage } from "./firebase";
import { TYPES, apiUrl, cleanCategories, detectType, formatDate, timeAgo } from "./lib";

const blankIdea = {
  url: "",
  title: "",
  notes: "",
  type: "auto",
  categories: "",
  filmDate: "",
  author: ""
};

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [approved, setApproved] = useState(false);
  const [ideas, setIdeas] = useState([]);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [category, setCategory] = useState("all");
  const [showPlanned, setShowPlanned] = useState(false);
  const [composer, setComposer] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profile, setProfile] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
    setUser(currentUser);
    setAuthReady(true);
    if (currentUser) {
      await setDoc(doc(db, "users", currentUser.uid), {
        displayName: currentUser.displayName || "",
        email: currentUser.email || "",
        photoURL: currentUser.photoURL || "",
        lastSeenAt: serverTimestamp()
      }, { merge: true });
    }
  }), []);

  useEffect(() => {
    if (!user?.email) {
      setAccessReady(false);
      setApproved(false);
      return undefined;
    }
    return onSnapshot(doc(db, "approvedEmails", user.email.toLowerCase()), (snapshot) => {
      setApproved(snapshot.exists() && snapshot.data().active !== false);
      setAccessReady(true);
    }, () => {
      setApproved(false);
      setAccessReady(true);
    });
  }, [user]);

  useEffect(() => {
    if (!user || !approved) {
      setIdeas([]);
      return undefined;
    }
    const ideaQuery = query(collection(db, "ideas"), orderBy("createdAt", "desc"));
    return onSnapshot(ideaQuery, (snapshot) => {
      setIdeas(snapshot.docs.map((result) => ({ id: result.id, ...result.data() })));
    }, () => setNotice("Could not load the library. Check Firestore rules and try again."));
  }, [user, approved]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const categories = useMemo(() => [...new Set(
    ideas.flatMap((idea) => idea.categories || [])
  )].sort(), [ideas]);

  const filteredIdeas = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ideas.filter((idea) => {
      const words = [
        idea.title, idea.notes, idea.url, idea.author, ...(idea.categories || [])
      ].join(" ").toLowerCase();
      const matchesSearch = !term || words.includes(term);
      const matchesType = activeType === "all" || idea.type === activeType;
      const matchesCategory = category === "all" || (idea.categories || []).includes(category);
      const matchesPlanned = !showPlanned || Boolean(idea.filmDate);
      return matchesSearch && matchesType && matchesCategory && matchesPlanned;
    });
  }, [ideas, search, activeType, category, showPlanned]);

  async function login() {
    try {
      await signInWithRedirect(auth, provider);
    } catch {
      setNotice("Google sign-in could not be completed.");
    }
  }

  async function removeIdea(idea) {
    if (!window.confirm(`Delete "${idea.title || "this idea"}"?`)) return;
    if (idea.storagePath) {
      await deleteObject(ref(storage, idea.storagePath)).catch(() => {});
    }
    await deleteDoc(doc(db, "ideas", idea.id));
    setNotice("Idea removed.");
  }

  if (!authReady) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <SignIn onSignIn={login} notice={notice} />;
  }

  if (!accessReady) {
    return <LoadingScreen />;
  }

  if (!approved) {
    return <AccessPending user={user} onSignOut={() => signOut(auth)} />;
  }

  return (
    <div className="shell">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <button className="ghost user-button" type="button" onClick={() => setProfile(true)}>
            {user.photoURL ? <img src={user.photoURL} alt="" /> : <span>{user.displayName?.[0]}</span>}
            <span>{user.displayName?.split(" ")[0] || "Profile"}</span>
            <ChevronDown size={14} />
          </button>
          <button className="primary" type="button" onClick={() => setComposer(true)}>
            <Plus size={17} /> Save idea
          </button>
        </div>
      </header>

      <main className="library">
        <section className="intro">
          <p className="eyebrow">Shared collection</p>
          <h1>A quiet place for ideas<br />worth filming.</h1>
          <p className="subhead">
            Save sparks from anywhere. Shape them later with your team and agents.
          </p>
        </section>

        <section className="command-bar" aria-label="Library filters">
          <label className="search">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, hooks or categories"
            />
          </label>
          <div className="pills">
            {TYPES.map((type) => (
              <button
                className={activeType === type.value ? "pill active" : "pill"}
                type="button"
                key={type.value}
                onClick={() => setActiveType(type.value)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </section>

        <section className="library-meta">
          <p><strong>{filteredIdeas.length}</strong> saved inspirations</p>
          <div className="secondary-filters">
            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {categories.map((tag) => <option value={tag} key={tag}>{tag}</option>)}
              </select>
            </label>
            <button
              className={showPlanned ? "toggle selected" : "toggle"}
              type="button"
              onClick={() => setShowPlanned(!showPlanned)}
            >
              <CalendarDays size={15} /> Planned to film
            </button>
          </div>
        </section>

        {filteredIdeas.length ? (
          <section className="masonry" aria-label="Saved ideas">
            {filteredIdeas.map((idea) => (
              <IdeaCard
                idea={idea}
                key={idea.id}
                onEdit={() => setEditing(idea)}
                onDelete={() => removeIdea(idea)}
              />
            ))}
          </section>
        ) : (
          <EmptyLibrary onCreate={() => setComposer(true)} hasIdeas={Boolean(ideas.length)} />
        )}
      </main>

      {(composer || editing) && (
        <IdeaComposer
          user={user}
          idea={editing}
          onClose={() => {
            setComposer(false);
            setEditing(null);
          }}
          onSaved={(message) => {
            setComposer(false);
            setEditing(null);
            setNotice(message);
          }}
        />
      )}

      {profile && (
        <ProfilePanel
          user={user}
          onClose={() => setProfile(false)}
          onSignOut={() => signOut(auth)}
          setNotice={setNotice}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><span /></span>
      <div>
        <p>Shared by Space</p>
        <span>Idea Library</span>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading">
      <span className="brand-mark"><span /></span>
    </div>
  );
}

function SignIn({ onSignIn, notice }) {
  return (
    <div className="signin">
      <div className="grain" />
      <div className="signin-panel">
        <Brand />
        <p className="eyebrow">Private creative operating system</p>
        <h1>Your team's visual<br />second brain.</h1>
        <p>
          Store references, hooks and moments worth returning to, all in one calm,
          searchable library.
        </p>
        <button className="google" type="button" onClick={onSignIn}>
          <GoogleMark /> Continue with Google
        </button>
        {notice && <p className="form-error">{notice}</p>}
      </div>
      <div className="signin-cards" aria-hidden="true">
        <div className="sample video"><span>Film reference</span><strong>The five-second hook</strong></div>
        <div className="sample quote"><strong>"Make the reveal feel earned."</strong><span>X post</span></div>
        <div className="sample still"><span>Planned / Jun 12</span></div>
      </div>
    </div>
  );
}

function AccessPending({ user, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function claimWorkspace() {
    setBusy(true);
    setMessage("");
    try {
      const claimOwner = httpsCallable(functions, "claimWorkspaceOwner");
      await claimOwner();
    } catch {
      setMessage("This workspace already has an owner. Ask them to approve your email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin pending">
      <div className="grain" />
      <div className="signin-panel">
        <Brand />
        <p className="eyebrow">Private library</p>
        <h1>Make this space<br />yours.</h1>
        <p>
          If you are setting up this private library for the first time, claim
          owner access with
          <strong className="member-email">{user.email}</strong>
        </p>
        {message && <p className="access-error">{message}</p>}
        <div className="pending-actions">
          <button className="primary" type="button" onClick={claimWorkspace} disabled={busy}>
            {busy ? "Claiming..." : "Create owner workspace"}
          </button>
          <button className="ghost" type="button" onClick={onSignOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.23-.16-1.8H9v3.41h4.84a4.14 4.14 0 0 1-1.8 2.72v2.25h2.91c1.7-1.57 2.69-3.88 2.69-6.58Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.25c-.81.54-1.84.87-3.05.87-2.35 0-4.34-1.59-5.05-3.72H.96v2.32A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.72A5.4 5.4 0 0 1 3.67 9c0-.6.1-1.18.28-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.99-2.32Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.32C4.66 5.15 6.65 3.58 9 3.58Z" />
    </svg>
  );
}

function EmptyLibrary({ onCreate, hasIdeas }) {
  return (
    <section className="empty">
      <Sparkles size={22} />
      <h2>{hasIdeas ? "No matches found" : "Begin your idea archive"}</h2>
      <p>{hasIdeas ? "Try a different filter or search phrase." : "Save a link, upload a still, or write down a loose hook."}</p>
      {!hasIdeas && <button className="primary" type="button" onClick={onCreate}><Plus size={17} /> Save first idea</button>}
    </section>
  );
}

function IdeaCard({ idea, onEdit, onDelete }) {
  const sourceLabel = {
    youtube: "YouTube",
    tweet: "X",
    instagram: "Instagram",
    screenshot: "Screenshot",
    article: "Article",
    reference: "Reference",
    hook: "Hook",
    reaction: "Reaction",
    idea: "Idea"
  }[idea.type] || "Reference";

  return (
    <article className={`card ${idea.type}`}>
      {idea.previewImage ? (
        <img className="preview" src={idea.previewImage} alt="" loading="lazy" />
      ) : idea.type === "tweet" ? (
        <div className="tweet-preview">
          <span className="x-mark">X</span>
          <p>{idea.notes || idea.title}</p>
          <span>{idea.author || "Saved post"}</span>
        </div>
      ) : (
        <div className="placeholder">
          {idea.type === "idea" ? <Sparkles /> : <Link2 />}
        </div>
      )}
      <div className="card-body">
        <div className="source">
          <span>{sourceLabel}</span>
          <span>{timeAgo(idea.createdAt)}</span>
        </div>
        <h2>{idea.title || "Untitled idea"}</h2>
        {idea.notes && idea.type !== "tweet" && <p className="notes">{idea.notes}</p>}
        {(idea.categories || []).length > 0 && (
          <div className="tags">
            {idea.categories.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}
        {idea.filmDate && (
          <p className="film-date"><Film size={14} /> Film on {formatDate(idea.filmDate)}</p>
        )}
        <div className="card-actions">
          {idea.url && (
            <a href={idea.url} target="_blank" rel="noreferrer" aria-label="Open original link">
              <ExternalLink size={15} /> Original
            </a>
          )}
          <button type="button" onClick={onEdit} aria-label="Edit idea"><PencilLine size={15} /></button>
          <button type="button" onClick={onDelete} aria-label="Delete idea"><Trash2 size={15} /></button>
        </div>
      </div>
    </article>
  );
}

function IdeaComposer({ user, idea, onClose, onSaved }) {
  const [form, setForm] = useState(idea ? {
    url: idea.url || "",
    title: idea.title || "",
    notes: idea.notes || "",
    type: idea.type || "auto",
    categories: (idea.categories || []).join(", "),
    filmDate: idea.filmDate || "",
    author: idea.author || ""
  } : blankIdea);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [linkPreview, setLinkPreview] = useState(idea?.url ? {
    url: idea.url,
    type: idea.type,
    title: idea.title,
    author: idea.author,
    previewImage: idea.previewImage,
    sourceName: idea.sourceName
  } : null);
  const [previewStatus, setPreviewStatus] = useState("");
  const initialUrl = useRef(idea?.url || "");
  const requestId = useRef(0);
  const editedByUser = useRef({
    title: Boolean(idea?.title),
    author: Boolean(idea?.author)
  });

  function update(field, value) {
    if (field === "title" || field === "author") {
      editedByUser.current[field] = true;
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    const url = form.url.trim();
    if (!url || (idea && url === initialUrl.current)) {
      setPreviewStatus("");
      if (!url) setLinkPreview(null);
      return undefined;
    }

    try {
      const candidate = new URL(url);
      if (!["http:", "https:"].includes(candidate.protocol)) {
        setPreviewStatus("");
        setLinkPreview(null);
        return undefined;
      }
    } catch {
      setPreviewStatus("");
      setLinkPreview(null);
      return undefined;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setPreviewStatus("loading");
    const timeout = window.setTimeout(async () => {
      try {
        const enrichLink = httpsCallable(functions, "enrichLink");
        const response = await enrichLink({ url });
        if (requestId.current !== currentRequest) return;
        const metadata = { url, ...(response.data || {}) };
        setLinkPreview(metadata);
        setPreviewStatus(
          metadata.title || metadata.author || metadata.previewImage ? "ready" : "limited"
        );
        setForm((current) => {
          if (current.url.trim() !== url) return current;
          return {
            ...current,
            title: !editedByUser.current.title && metadata.title ? metadata.title : current.title,
            author: !editedByUser.current.author && metadata.author ? metadata.author : current.author
          };
        });
      } catch {
        if (requestId.current !== currentRequest) return;
        setLinkPreview({ url, type: detectType(url) });
        setPreviewStatus("unavailable");
      }
    }, 450);

    return () => {
      window.clearTimeout(timeout);
      if (requestId.current === currentRequest) {
        requestId.current += 1;
      }
    };
  }, [form.url, idea]);

  async function save(event) {
    event.preventDefault();
    if (!form.title.trim() && !form.url.trim() && !form.notes.trim() && !file) {
      setMessage("Add a link, title, note or image first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const url = form.url.trim();
      let metadata = (
        linkPreview?.url === url && ["ready", "limited"].includes(previewStatus)
      ) ? linkPreview : {};
      if (url && !metadata.url) {
        try {
          const enrichLink = httpsCallable(functions, "enrichLink");
          const response = await enrichLink({ url });
          metadata = response.data || {};
        } catch {
          metadata = { type: detectType(url, form.type) };
        }
      }
      let uploadedImage = idea?.previewImage || "";
      let storagePath = idea?.storagePath || "";
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        storagePath = `ideas/${user.uid}/${Date.now()}-${safeName}`;
        const imageRef = ref(storage, storagePath);
        await uploadBytes(imageRef, file, { contentType: file.type });
        uploadedImage = await getDownloadURL(imageRef);
        if (idea?.storagePath && idea.storagePath !== storagePath) {
          await deleteObject(ref(storage, idea.storagePath)).catch(() => {});
        }
      }
      const type = detectType(form.url, form.type === "auto" ? metadata.type : form.type);
      const payload = {
        url,
        title: form.title.trim() || metadata.title || "Untitled idea",
        notes: form.notes.trim(),
        type,
        categories: cleanCategories(form.categories),
        filmDate: form.filmDate || null,
        author: form.author.trim() || metadata.author || "",
        previewImage: uploadedImage || metadata.previewImage || "",
        storagePath,
        sourceName: metadata.sourceName || "",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      };
      if (idea) {
        await updateDoc(doc(db, "ideas", idea.id), payload);
        onSaved("Idea updated.");
      } else {
        await addDoc(collection(db, "ideas"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
        onSaved("Saved to your library.");
      }
    } catch {
      setMessage("Could not save this idea. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} title={idea ? "Edit idea" : "Save inspiration"}>
      <form className="composer" onSubmit={save}>
        <label className="wide">
          <span>Link</span>
          <input
            type="url"
            value={form.url}
            onChange={(event) => update("url", event.target.value)}
            placeholder="Paste a YouTube, X, Instagram or article URL"
          />
          {!previewStatus && <small>Paste a link and title, attribution, and preview will fill automatically.</small>}
          {previewStatus === "loading" && (
            <div className="link-enrichment loading">
              <Sparkles size={16} />
              <span>Finding title and attribution...</span>
            </div>
          )}
          {previewStatus && previewStatus !== "loading" && linkPreview && (
            <div className="link-enrichment">
              {linkPreview.previewImage && <img src={linkPreview.previewImage} alt="" />}
              <div className="link-enrichment-copy">
                <span>{linkPreview.sourceName || "Saved link"}</span>
                <strong>{linkPreview.title || "Link ready to save"}</strong>
                <small>
                  {linkPreview.author || (
                    previewStatus === "unavailable"
                      ? "Preview unavailable; add details only if you want."
                      : "Add attribution only if needed."
                  )}
                </small>
              </div>
            </div>
          )}
        </label>
        <label>
          <span>Title or hook</span>
          <input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="What made this worth saving?" />
        </label>
        <label>
          <span>Content type</span>
          <select value={form.type} onChange={(event) => update("type", event.target.value)}>
            <option value="auto">Detect automatically</option>
            {TYPES.slice(1).map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="wide">
          <span>Notes</span>
          <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Reaction, angle, or the opening line it could become..." />
        </label>
        <label>
          <span>Categories</span>
          <input value={form.categories} onChange={(event) => update("categories", event.target.value)} placeholder="hook, travel, interview" />
          <small>Comma separated; none are created by default.</small>
        </label>
        <label>
          <span>Planned film date</span>
          <input type="date" value={form.filmDate} onChange={(event) => update("filmDate", event.target.value)} />
        </label>
        <label>
          <span>Attribution</span>
          <input value={form.author} onChange={(event) => update("author", event.target.value)} placeholder="@creator or channel" />
        </label>
        <label className="upload">
          <span>Preview image / screenshot</span>
          <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files[0] || null)} />
          <div><ImagePlus size={18} /> {file ? file.name : "Choose image"}</div>
        </label>
        {message && <p className="form-error">{message}</p>}
        <div className="form-actions">
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Saving..." : idea ? "Save changes" : "Add to library"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProfilePanel({ user, onClose, onSignOut, setNotice }) {
  const [token, setToken] = useState("");
  const [generatedId, setGeneratedId] = useState("");
  const [tokens, setTokens] = useState([]);
  const [label, setLabel] = useState("My agent");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadTokens() {
    try {
      const listTokens = httpsCallable(functions, "listAgentTokens");
      const result = await listTokens();
      setTokens(result.data.tokens || []);
    } catch {
      setTokens([]);
    }
  }

  useEffect(() => {
    loadTokens();
  }, []);

  async function createToken() {
    setBusy(true);
    try {
      const generateToken = httpsCallable(functions, "createAgentToken");
      const result = await generateToken({ label: label.trim() || "Agent" });
      setToken(result.data.token);
      setGeneratedId(result.data.id);
      await loadTokens();
    } catch {
      setNotice("Deploy Cloud Functions before generating agent credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id) {
    const revokeToken = httpsCallable(functions, "revokeAgentToken");
    await revokeToken({ id });
    if (id === generatedId) {
      setToken("");
      setGeneratedId("");
    }
    await loadTokens();
    setNotice("Agent credential revoked.");
  }

  const skill = `# Shared by Space Agent Skill

Use the Shared by Space idea library as structured memory for video concepts.

API endpoint: ${apiUrl()}
Authorization: Bearer ${token || "<generate-a-token-first>"}

Actions:
- GET /ideas?search=hook&category=travel - list or search saved ideas
- POST /ideas - create an idea with JSON fields: title, url, notes, type, categories, filmDate, previewImage
- PATCH /ideas/{id} - update any of those fields
- DELETE /ideas/{id} - remove an idea

Never expose this token. Include it only as the Authorization bearer token.
Read existing ideas before adding duplicates. Categories are optional and must only be added when useful.`;

  async function copySkill() {
    await navigator.clipboard.writeText(skill);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Modal onClose={onClose} title="Profile & agent access" narrow>
      <div className="profile-card">
        {user.photoURL && <img src={user.photoURL} alt="" />}
        <div><strong>{user.displayName}</strong><p>{user.email}</p></div>
        <button className="ghost signout" type="button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
      </div>
      <section className="agent-panel">
        <div className="panel-heading">
          <KeyRound size={18} />
          <div>
            <h3>Connect an agent</h3>
            <p>Create a revocable credential and copy these instructions into Codex or Claude Code.</p>
          </div>
        </div>
        <div className="token-create">
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Credential name" />
          <button className="primary" type="button" onClick={createToken} disabled={busy}>
            {busy ? "Creating..." : "Generate token"}
          </button>
        </div>
        {token && (
          <div className="skill-block">
            <div className="skill-toolbar">
              <span>Agent instruction block</span>
              <button type="button" onClick={copySkill}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copied" : "Copy"}</button>
            </div>
            <pre>{skill}</pre>
          </div>
        )}
        {tokens.length > 0 && (
          <div className="token-list">
            <h4>Active credentials</h4>
            {tokens.map((entry) => (
              <div key={entry.id}>
                <span>{entry.label}</span>
                <button type="button" onClick={() => revoke(entry.id)}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </Modal>
  );
}

function Modal({ title, children, onClose, narrow = false }) {
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <section className={narrow ? "modal narrow" : "modal"} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="close" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default App;
