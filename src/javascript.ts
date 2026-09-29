import { match } from 'ts-pattern'

type Draw = () => number

type Choices<T> = readonly [T, ...T[]]

const INDENT = '  '

const NOUNS = [
  'user',
  'session',
  'order',
  'item',
  'config',
  'token',
  'request',
  'response',
  'entry',
  'record',
  'payload',
  'message',
  'account',
  'invoice',
  'task'
] as const

const FIELDS = [
  'id',
  'name',
  'status',
  'total',
  'items',
  'createdAt',
  'key',
  'value',
  'count',
  'email'
] as const

const VERBS = [
  'load',
  'parse',
  'fetch',
  'resolve',
  'build',
  'render',
  'update',
  'merge',
  'validate',
  'format',
  'save',
  'find'
] as const

const METHODS = ['map', 'filter', 'find', 'some', 'every', 'flatMap'] as const

const COMPARISONS = ['===', '!==', '>', '<', '>='] as const

const OPERATORS = ['+', '-', '*', '&&', '||', '??'] as const

const WORDS = [
  'ready',
  'missing',
  'done',
  'pending',
  'invalid',
  'saved'
] as const

const MODULES = [
  'node:fs/promises',
  'node:path',
  './store.js',
  './client.js',
  './format.js',
  './schema.js'
] as const

const pick = <T>(draw: Draw, choices: Choices<T>): T =>
  choices[Math.floor(draw() * choices.length)] ?? choices[0]

const oneOf = <T>(draw: Draw, makers: Choices<() => T>): T =>
  pick(draw, makers)()

const between = (draw: Draw, low: number, high: number): number =>
  low + Math.floor(draw() * (high - low + 1))

const times = <T>(count: number, make: () => T): readonly T[] =>
  Array.from({ length: count }, make)

const capitalized = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}`

const indented = (lines: readonly string[]): readonly string[] =>
  lines.map((line) => `${INDENT}${line}`)

const noun = (draw: Draw): string => pick(draw, NOUNS)

const member = (draw: Draw): string => `${noun(draw)}.${pick(draw, FIELDS)}`

const functionName = (draw: Draw): string =>
  `${pick(draw, VERBS)}${capitalized(noun(draw))}`

const literal = (draw: Draw): string =>
  oneOf(draw, [
    () => String(between(draw, 0, 100)),
    () => `'${pick(draw, WORDS)}'`,
    () => 'null',
    () => 'true',
    () => 'undefined'
  ])

const leaf = (draw: Draw): string =>
  oneOf(draw, [
    () => noun(draw),
    () => member(draw),
    () => member(draw),
    () => literal(draw)
  ])

const expression = (draw: Draw, depth: number): string =>
  match(depth)
    .with(0, () => leaf(draw))
    .otherwise(() => {
      const inner = (): string => expression(draw, depth - 1)
      const list = (): string => times(between(draw, 1, 3), inner).join(', ')

      return oneOf(draw, [
        () => leaf(draw),
        () => `${functionName(draw)}(${list()})`,
        () => {
          const each = noun(draw)
          return `${each}s.${pick(draw, METHODS)}((${each}) => ${inner()})`
        },
        () => `${inner()} ${pick(draw, OPERATORS)} ${inner()}`,
        () => `{ ${pick(draw, FIELDS)}: ${inner()}, ...${noun(draw)} }`,
        () => `[${list()}]`,
        () => `\`${pick(draw, WORDS)} \${${member(draw)}}\``,
        () => `await ${functionName(draw)}(${noun(draw)})`
      ])
    })

const condition = (draw: Draw): string =>
  oneOf(draw, [
    () => `${member(draw)} ${pick(draw, COMPARISONS)} ${literal(draw)}`,
    () => `!${noun(draw)}`,
    () => `${noun(draw)}s.length > 0`,
    () => `${functionName(draw)}(${noun(draw)})`
  ])

const block = (draw: Draw, depth: number): readonly string[] =>
  indented(times(between(draw, 1, 3), () => statement(draw, depth)).flat())

const statement = (draw: Draw, depth: number): readonly string[] =>
  oneOf<readonly string[]>(draw, [
    () => [`const ${noun(draw)} = ${expression(draw, 2)}`],
    () => [`const ${noun(draw)} = ${expression(draw, 2)}`],
    () => [`${functionName(draw)}(${expression(draw, 1)})`],
    () => [`return ${expression(draw, 1)}`],
    ...match(depth)
      .with(0, () => [])
      .otherwise(() => [
        () => [`if (${condition(draw)}) {`, ...block(draw, depth - 1), '}'],
        () => {
          const each = noun(draw)
          return [
            `for (const ${each} of ${each}s) {`,
            ...block(draw, depth - 1),
            '}'
          ]
        },
        () => [
          'try {',
          ...block(draw, depth - 1),
          '} catch (error) {',
          `${INDENT}console.error(error)`,
          '}'
        ]
      ])
  ])

const body = (draw: Draw): readonly string[] => [
  ...block(draw, 2),
  `${INDENT}return ${expression(draw, 2)}`
]

const declaration = (draw: Draw): readonly string[] => {
  const name = functionName(draw)
  const parameters = times(between(draw, 1, 2), () => noun(draw)).join(', ')

  return oneOf<readonly string[]>(draw, [
    () => [
      `export async function ${name}(${parameters}) {`,
      ...body(draw),
      '}'
    ],
    () => [`export const ${name} = (${parameters}) => {`, ...body(draw), '}'],
    () => [
      `const ${name} = (${parameters}) =>`,
      `${INDENT}${expression(draw, 3)}`
    ]
  ])
}

const importLine = (draw: Draw): string =>
  `import { ${functionName(draw)} } from '${pick(draw, MODULES)}'`

/** Reads like application code; it is never parsed or run. */
export const javascript = (draw: Draw): string =>
  [
    times(between(draw, 1, 3), () => importLine(draw)).join('\n'),
    ...times(between(draw, 2, 3), () => declaration(draw).join('\n'))
  ].join('\n\n')
