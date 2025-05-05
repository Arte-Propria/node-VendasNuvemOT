import { POSTtinyABSTRACT, POSTtinyES } from "./post.js"
import { PUTtinyES, PUTtinyABSTRACT } from "./put.js"
import { GETtinyES, GETtinyABSTRACT, GETtinyESnote } from "./get.js"

export const POSTtiny = {
	ES: POSTtinyES,
	ABSTRACT: POSTtinyABSTRACT
}

export const PUTtiny = {
	ES: PUTtinyES,
	ABSTRACT: PUTtinyABSTRACT
}

export const GETtiny = {
	ES: GETtinyES,
	ABSTRACT: GETtinyABSTRACT,
	ESnote: GETtinyESnote
}

