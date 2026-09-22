declare module "esfuzz" {
	interface Program {
		readonly type: "Program"
		readonly body: readonly unknown[]
	}

	export function generate(options?: { readonly maxDepth?: number }): Program
	export function render(program: Program): string
}
