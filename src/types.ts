export type config = {
	'type': 'fixed' | 'sliding',
	'scope': string
	'key': string
	'limit': number
	'interval': number
}

export type Facts = Record<string, any>