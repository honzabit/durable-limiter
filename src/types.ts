type Block = { type: 'block', for?: number}
type Redirect = { type: 'redirect', status: typeof redirectStatus[number], to: string }

export const redirectStatus = [ 300, 301, 302, 303, 304, 307, 308 ] as const

export type config = {
	'type': 'fixed' | 'sliding',
	'scope': string
	'key': string
	'limit': number
	'interval': number
	'action'?: Block | Redirect
}
