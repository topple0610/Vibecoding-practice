// /*
// 打印最终的 twoD 内容。

// 11.（可选扩展）写一些测试 append 行为的代码：
// - 让切片容量由满 → 扩容
// - 打印每次 append 后的 len 和 cap
// - 验证你对扩容规则的理解
// */
// package main

// import (
// 	"fmt"
// 	"slices"
// )

// func main() {
// 	/*
// 		1.	创建一个未初始化的字符串切片 s，并打印它是否为 nil，以及长度是否为 0。
// 		2.	使用 make 创建一个长度为 3 的字符串切片 s，并打印它的初始内容、长度和容量。
// 		3.	给切片 s 的每个位置分别赋值 “a”、“b”、“c”，并打印设置后的切片内容和第三个元素。
// 		4.	打印当前切片的长度。
// 		5.	使用 append 给 s 追加元素：
// 		•	先追加 "d"
// 		•	再追加 "e" 和 "f"
// 	*/
// 	var s []string
// 	fmt.Println("s = ", s, s == nil, len(s) == 0)

// 	s = make([]string, 3)
// 	fmt.Println("s = ", s, len(s), cap(s))

// 	s[0] = "a"
// 	s[1] = "b"
// 	s[2] = "c"
// 	fmt.Println("s = ", s, s[2])

// 	fmt.Println("len(s) = ", len(s))

// 	s = append(s, "d")
// 	s = append(s, "e", "f")
// 	fmt.Println("s = ", s)

// 	/*
// 			打印追加后的切片内容。
// 		同时要体现 append 会在 cap 不够时自动扩容。
// 		 6. 创建一个长度与 s 相同的新切片 c，使用 copy 将 s 的内容拷贝进去，并打印 c。
// 		 7. 对 s 做三种切片操作：
// 		    •	s[2:5]
// 		    •	s[:5]
// 		    •	s[2:]

// 		并分别打印结果。
// 		 8. 用字面量声明一个新的切片 t，并打印它。
// 		 9. 再声明另一个内容相同的切片 t2，

// 		使用 slices.Equal 判断 t 与 t2 是否相等，若相等则打印提示信息。
// 		 10. 创建一个二维切片 twoD：
// 		    •	外层长度为 3
// 		    •	每一行的长度依次为 1、2、3
// 		    •	每个元素的值等于行索引与列索引之和
// 	*/
// 	fmt.Println("s = ", s, len(s), cap(s))

// 	c := make([]string, len(s))
// 	copy(c, s)
// 	fmt.Println("c = ", c, len(c), cap(c))

// 	fmt.Println("s[2:5] = ", s[2:5])
// 	fmt.Println("s[:5] = ", s[:5])
// 	fmt.Println("s[2:] = ", s[2:])

// 	t := []string{"a", "b", "c"}
// 	fmt.Println("t = ", t)

// 	t2 := []string{"a", "b", "c"}
// 	fmt.Println("t2 = ", t2)

// 	fmt.Println("slices.Equal(t, t2) = ", slices.Equal(t, t2))

//		twoD := make([][]int, 3)
//		for i := range 3 {
//			twoD[i] = make([]int, i+1)
//			for j := range i + 1 {
//				twoD[i][j] = i + j
//			}
//		}
//		fmt.Println("twoD = ", twoD)
//	}
package main

import "fmt"

func intSeq() func() int {
	i := 0
	i += 200
	fmt.Println("time is 11111")
	fmt.Println("i = ", &i)
	return func() int {
		i++
		return i
	}
}

func main() {

	nextInt := intSeq()

	fmt.Println(nextInt())
	fmt.Println(nextInt())
	fmt.Println(nextInt())

	newInts := intSeq()
	fmt.Println(newInts())
}
