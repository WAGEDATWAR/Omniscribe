/**
 * The formula language (A-8, S-12, docs/SHEET.md 3). Total, typed, no coercion, no loops, no `eval`.
 * This module imports nothing; it never sees a character, the DOM or storage.
 */
export const FORMULA_LIMITS = Object.freeze({ chars: 500, nodes: 400, depth: 40, steps: 20000, string: 200, power: 100 });

export class FormulaError extends Error {
  constructor(message, index = null) {
    super(message);
    this.name = "FormulaError";
    this.index = index;
  }
}

export const FUNCTIONS = Object.freeze({
  abs: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  floor: { min: 1, max: 1 },
  round: { min: 1, max: 2 },
  min: { min: 1, max: Infinity },
  max: { min: 1, max: Infinity },
  clamp: { min: 3, max: 3 },
  if: { min: 3, max: 3 },
  sum: { min: 1, max: 2 },
  avg: { min: 1, max: 2 },
  count: { min: 1, max: 2 },
  lookup: { min: 2, max: 3 },
  step: { min: 2, max: 3 },
  index: { min: 1, max: 1 },
  has: { min: 2, max: 2 },
  signed: { min: 1, max: 1 },
  text: { min: 1, max: 1 },
  concat: { min: 1, max: Infinity },
  number: { min: 1, max: 1 }
});

const COMPARISONS = new Set(["==", "!=", "<", "<=", ">", ">="]);
const TWO_CHARACTER = new Set(["&&", "||", "==", "!=", "<=", ">="]);
const ONE_CHARACTER = new Set(["+", "-", "*", "/", "%", "^", "!", "<", ">", "(", ")", ","]);

const isDigit = (char) => char >= "0" && char <= "9";
const isNameStart = (char) => (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
const isNameChar = (char) => isNameStart(char) || isDigit(char);

function readName(source, start) {
  let end = start;

  while (end < source.length && isNameChar(source[end])) {
    end += 1;
  }

  return end;
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
    } else if (isDigit(char)) {
      let end = index;

      while (isDigit(source[end] ?? "")) {
        end += 1;
      }

      if (source[end] === "." && isDigit(source[end + 1] ?? "")) {
        end += 1;

        while (isDigit(source[end] ?? "")) {
          end += 1;
        }
      }

      if (isNameStart(source[end] ?? "")) {
        throw new FormulaError("A number cannot run into a word", index);
      }

      tokens.push({ type: "number", value: Number(source.slice(index, end)), index });
      index = end;
    } else if (char === '"') {
      let value = "";
      let end = index + 1;
      let closed = false;

      while (end < source.length) {
        const next = source[end];

        if (next === "\\" && (source[end + 1] === '"' || source[end + 1] === "\\")) {
          value += source[end + 1];
          end += 2;
        } else if (next === '"') {
          closed = true;
          end += 1;
          break;
        } else {
          value += next;
          end += 1;
        }
      }

      if (!closed) {
        throw new FormulaError("This text is missing its closing quote", index);
      }

      if (value.length > FORMULA_LIMITS.string) {
        throw new FormulaError(`Text in a formula is limited to ${FORMULA_LIMITS.string} characters`, index);
      }

      tokens.push({ type: "string", value, index });
      index = end;
    } else if (char === "@") {
      const parts = [];
      let end = index + 1;

      while (true) {
        const stop = readName(source, end);

        if (stop === end) {
          throw new FormulaError("A reference needs a name after @", index);
        }

        parts.push(source.slice(end, stop));
        end = stop;

        if (source[end] === "." && isNameStart(source[end + 1] ?? "")) {
          end += 1;
        } else {
          break;
        }
      }

      tokens.push({ type: "ref", value: parts, index });
      index = end;
    } else if (char === "$") {
      if (source[index + 1] !== "." || !isNameStart(source[index + 2] ?? "")) {
        throw new FormulaError("$ must be followed by .name, as in $.cost", index);
      }

      const stop = readName(source, index + 2);
      tokens.push({ type: "item", value: source.slice(index + 2, stop), index });
      index = stop;
    } else if (isNameStart(char)) {
      const stop = readName(source, index);
      tokens.push({ type: "name", value: source.slice(index, stop), index });
      index = stop;
    } else if (TWO_CHARACTER.has(source.slice(index, index + 2))) {
      tokens.push({ type: "op", value: source.slice(index, index + 2), index });
      index += 2;
    } else if (ONE_CHARACTER.has(char)) {
      tokens.push({ type: "op", value: char, index });
      index += 1;
    } else {
      throw new FormulaError(`Unexpected character "${char}"`, index);
    }
  }

  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
    this.depth = 0;
    this.nodes = 0;
  }

  peek() {
    return this.tokens[this.position] ?? null;
  }

  next() {
    const token = this.tokens[this.position] ?? null;
    this.position += 1;
    return token;
  }

  isOp(value) {
    const token = this.peek();
    return token?.type === "op" && token.value === value;
  }

  expectOp(value) {
    const token = this.next();

    if (token?.type !== "op" || token.value !== value) {
      throw new FormulaError(`Expected "${value}"`, token?.index ?? null);
    }

    return token;
  }

  node(kind, fields, index) {
    this.nodes += 1;

    if (this.nodes > FORMULA_LIMITS.nodes) {
      throw new FormulaError(`This formula is too large (over ${FORMULA_LIMITS.nodes} parts)`, index);
    }

    return { kind, index, ...fields };
  }

  descend(parse) {
    this.depth += 1;

    if (this.depth > FORMULA_LIMITS.depth) {
      throw new FormulaError("This formula is nested too deeply", this.peek()?.index ?? null);
    }

    try {
      return parse();
    } finally {
      this.depth -= 1;
    }
  }

  parse() {
    if (!this.tokens.length) {
      throw new FormulaError("The formula is empty", 0);
    }

    const root = this.or();
    const extra = this.peek();

    if (extra) {
      throw new FormulaError(`Unexpected "${extra.value}"`, extra.index);
    }

    return root;
  }

  or() {
    let left = this.and();

    while (this.isOp("||")) {
      const token = this.next();
      left = this.node("binary", { op: "||", left, right: this.and() }, token.index);
    }

    return left;
  }

  and() {
    let left = this.compare();

    while (this.isOp("&&")) {
      const token = this.next();
      left = this.node("binary", { op: "&&", left, right: this.compare() }, token.index);
    }

    return left;
  }

  compare() {
    const left = this.add();
    const token = this.peek();

    if (token?.type === "op" && COMPARISONS.has(token.value)) {
      this.next();
      const node = this.node("binary", { op: token.value, left, right: this.add() }, token.index);
      const following = this.peek();

      if (following?.type === "op" && COMPARISONS.has(following.value)) {
        throw new FormulaError("Comparisons cannot be chained; combine them with &&", following.index);
      }

      return node;
    }

    return left;
  }

  add() {
    let left = this.mul();

    while (this.isOp("+") || this.isOp("-")) {
      const token = this.next();
      left = this.node("binary", { op: token.value, left, right: this.mul() }, token.index);
    }

    return left;
  }

  mul() {
    let left = this.unary();

    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const token = this.next();
      left = this.node("binary", { op: token.value, left, right: this.unary() }, token.index);
    }

    return left;
  }

  unary() {
    if (this.isOp("-") || this.isOp("!")) {
      const token = this.next();
      return this.node("unary", { op: token.value, operand: this.descend(() => this.unary()) }, token.index);
    }

    return this.power();
  }

  power() {
    const base = this.primary();

    if (this.isOp("^")) {
      const token = this.next();
      return this.node("binary", { op: "^", left: base, right: this.descend(() => this.unary()) }, token.index);
    }

    return base;
  }

  primary() {
    const token = this.next();

    if (!token) {
      throw new FormulaError("The formula ends too soon", this.tokens.at(-1)?.index ?? 0);
    }

    if (token.type === "number") {
      return this.node("number", { value: token.value }, token.index);
    }

    if (token.type === "string") {
      return this.node("string", { value: token.value }, token.index);
    }

    if (token.type === "ref") {
      return this.node("ref", { path: token.value }, token.index);
    }

    if (token.type === "item") {
      return this.node("item", { field: token.value }, token.index);
    }

    if (token.type === "name") {
      if (this.isOp("(")) {
        this.next();
        const args = [];

        if (!this.isOp(")")) {
          args.push(this.descend(() => this.or()));

          while (this.isOp(",")) {
            this.next();
            args.push(this.descend(() => this.or()));
          }
        }

        this.expectOp(")");
        return this.node("call", { name: token.value, args }, token.index);
      }

      if (token.value === "true" || token.value === "false") {
        return this.node("boolean", { value: token.value === "true" }, token.index);
      }

      throw new FormulaError(`Unknown word "${token.value}"; references start with @`, token.index);
    }

    if (token.type === "op" && token.value === "(") {
      const inner = this.descend(() => this.or());
      this.expectOp(")");
      return inner;
    }

    throw new FormulaError(`Unexpected "${token.value}"`, token.index);
  }
}

function walk(node, visit) {
  visit(node);

  if (node.kind === "binary") {
    walk(node.left, visit);
    walk(node.right, visit);
  } else if (node.kind === "unary") {
    walk(node.operand, visit);
  } else if (node.kind === "call") {
    node.args.forEach((argument) => walk(argument, visit));
  }
}

/** Parses without throwing: `{ ok, ast, refs, itemFields, error }`. `refs` are `@` paths such as `["str", "mod"]`. */
export function parseFormula(source) {
  if (typeof source !== "string") {
    return { ok: false, error: { message: "A formula must be text", index: null } };
  }

  if (source.length > FORMULA_LIMITS.chars) {
    return { ok: false, error: { message: `A formula is limited to ${FORMULA_LIMITS.chars} characters`, index: null } };
  }

  try {
    const ast = new Parser(tokenize(source)).parse();
    const refs = [];
    const itemFields = new Set();

    walk(ast, (node) => {
      if (node.kind === "ref") {
        refs.push(node.path);
      } else if (node.kind === "item") {
        itemFields.add(node.field);
      }
    });

    return { ok: true, ast, refs, itemFields: [...itemFields], source };
  } catch (error) {
    if (error instanceof FormulaError) {
      return { ok: false, error: { message: error.message, index: error.index } };
    }

    throw error;
  }
}

/**
 * Static checks that need the system around the formula. `env`:
 * `ref(path) -> "value" | "choice" | "list" | "column" | "collection" | null`,
 * `collectionFields(key) -> Set | null`, `tables: Set`, `item: Set | null` (the row fields `$` may name).
 */
export function checkFormula(parsed, env) {
  const errors = [];
  const report = (message, node) => errors.push({ message, index: node?.index ?? null });

  function kindOf(node) {
    return node.kind === "ref" ? env.ref(node.path) : null;
  }

  function visit(node, item) {
    if (node.kind === "binary") {
      visit(node.left, item);
      visit(node.right, item);
    } else if (node.kind === "unary") {
      visit(node.operand, item);
    } else if (node.kind === "item") {
      if (!item) {
        report("$ can only be used inside a collection row formula or a sum, count or avg test", node);
      } else if (!item.has(node.field)) {
        report(`This row has no field named "${node.field}"`, node);
      }
    } else if (node.kind === "ref") {
      const kind = env.ref(node.path);

      if (!kind) {
        report(`Unknown reference @${node.path.join(".")}`, node);
      } else if (kind === "column" || kind === "collection") {
        report(`@${node.path.join(".")} is a collection; use it inside sum, count, avg, min or max`, node);
      } else if (kind === "list") {
        report(`@${node.path.join(".")} is a list; use it inside has()`, node);
      }
    } else if (node.kind === "call") {
      call(node, item);
    }
  }

  function call(node, item) {
    const spec = FUNCTIONS[node.name];

    if (!spec) {
      report(`Unknown function ${node.name}()`, node);
      return;
    }

    if (node.args.length < spec.min || node.args.length > spec.max) {
      const range = spec.max === Infinity ? `at least ${spec.min}` : spec.min === spec.max ? `${spec.min}` : `${spec.min} to ${spec.max}`;
      report(`${node.name}() takes ${range} argument${spec.max === 1 ? "" : "s"}`, node);
      return;
    }

    const first = node.args[0];
    const firstKind = kindOf(first);
    const aggregates = node.name === "sum" || node.name === "avg" || node.name === "count";
    const reducing = (node.name === "min" || node.name === "max") && (firstKind === "column" || firstKind === "collection");

    if (aggregates || reducing) {
      if (firstKind !== "column" && !(node.name === "count" && firstKind === "collection")) {
        report(`${node.name}() needs a collection column such as @powers.cost${node.name === "count" ? " or a collection" : ""}`, first);
        return;
      }

      if (reducing && node.args.length > 1) {
        report(`${node.name}() over a column takes only the column`, node);
        return;
      }

      const rowFields = env.collectionFields(first.path[0]);

      if (node.args[1]) {
        visit(node.args[1], rowFields ?? new Set());
      }

      return;
    }

    if (node.name === "lookup" || node.name === "step") {
      if (first.kind !== "string") {
        report(`${node.name}() needs a table name in quotes as its first argument`, first);
      } else if (!env.tables.has(first.value)) {
        report(`There is no table named "${first.value}"`, first);
      }

      node.args.slice(1).forEach((argument) => visit(argument, item));
      return;
    }

    if (node.name === "index") {
      if (firstKind !== "choice") {
        report("index() needs a choice field, such as index(@rank)", first);
      }

      return;
    }

    if (node.name === "has") {
      if (firstKind !== "list") {
        report("has() needs a list field as its first argument", first);
      }

      visit(node.args[1], item);
      return;
    }

    node.args.forEach((argument) => visit(argument, item));
  }

  visit(parsed.ast, env.item ?? null);
  return errors;
}

export function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function describe(value) {
  return typeof value === "number" ? "a number" : typeof value === "string" ? "text" : typeof value === "boolean" ? "true or false" : "a list";
}

class Budget {
  constructor(limit) {
    this.steps = 0;
    this.limit = limit;
  }

  tick(count = 1) {
    this.steps += count;

    if (this.steps > this.limit) {
      throw new FormulaError("This formula is too expensive to evaluate");
    }
  }
}

function number(value, node, what = "") {
  if (typeof value !== "number") {
    throw new FormulaError(`${what || "This"} needs a number but got ${describe(value)}`, node?.index ?? null);
  }

  return value;
}

function boolean(value, node) {
  if (typeof value !== "boolean") {
    throw new FormulaError(`This needs true or false but got ${describe(value)}`, node?.index ?? null);
  }

  return value;
}

function finite(value, node) {
  if (!Number.isFinite(value)) {
    throw new FormulaError("The result is not a finite number", node?.index ?? null);
  }

  return value;
}

/**
 * `context`: `scalar(path) -> value | undefined`, `collection(path) -> { rows, field } | null`,
 * `list(path) -> array | null`, `choiceIndex(path) -> number | null`, `table(name) -> object | null`,
 * `item: { get(field) } | null`.
 */
function evaluateNode(node, context, budget) {
  budget.tick();

  switch (node.kind) {
    case "number":
    case "string":
    case "boolean":
      return node.value;
    case "item": {
      if (!context.item) {
        throw new FormulaError("$ is not available here", node.index);
      }

      const value = context.item.get(node.field);

      if (value === undefined || value === null) {
        throw new FormulaError(`$.${node.field} has no value`, node.index);
      }

      return value;
    }
    case "ref": {
      if (context.collection(node.path)) {
        throw new FormulaError(`@${node.path.join(".")} is a collection and cannot be used as a single value`, node.index);
      }

      const value = context.scalar(node.path);

      if (value === undefined || value === null) {
        throw new FormulaError(`@${node.path.join(".")} has no value`, node.index);
      }

      return value;
    }
    case "unary": {
      const operand = evaluateNode(node.operand, context, budget);
      return node.op === "-" ? -number(operand, node.operand, "Negation") : !boolean(operand, node.operand);
    }
    case "binary":
      return binary(node, context, budget);
    case "call":
      return callFunction(node, context, budget);
    default:
      throw new FormulaError("Unknown formula part", node.index);
  }
}

function binary(node, context, budget) {
  const { op } = node;

  if (op === "&&" || op === "||") {
    const left = boolean(evaluateNode(node.left, context, budget), node.left);

    if (op === "&&" ? !left : left) {
      return left;
    }

    return boolean(evaluateNode(node.right, context, budget), node.right);
  }

  const left = evaluateNode(node.left, context, budget);
  const right = evaluateNode(node.right, context, budget);

  if (op === "==" || op === "!=") {
    if (typeof left !== typeof right) {
      throw new FormulaError(`Cannot compare ${describe(left)} with ${describe(right)}`, node.index);
    }

    return op === "==" ? left === right : left !== right;
  }

  if (op === "<" || op === "<=" || op === ">" || op === ">=") {
    if (typeof left !== typeof right || (typeof left !== "number" && typeof left !== "string")) {
      throw new FormulaError(`Cannot order ${describe(left)} against ${describe(right)}`, node.index);
    }

    return op === "<" ? left < right : op === "<=" ? left <= right : op === ">" ? left > right : left >= right;
  }

  const a = number(left, node.left, `The left side of ${op}`);
  const b = number(right, node.right, `The right side of ${op}`);

  switch (op) {
    case "+":
      return finite(a + b, node);
    case "-":
      return finite(a - b, node);
    case "*":
      return finite(a * b, node);
    case "/":
      if (b === 0) {
        throw new FormulaError("Division by zero", node.index);
      }

      return finite(a / b, node);
    case "%":
      if (b === 0) {
        throw new FormulaError("Division by zero", node.index);
      }

      return finite(a % b, node);
    default:
      if (Math.abs(b) > FORMULA_LIMITS.power) {
        throw new FormulaError(`An exponent is limited to ${FORMULA_LIMITS.power}`, node.index);
      }

      return finite(a ** b, node);
  }
}

function rowsOf(node, context) {
  const source = context.collection(node.path);

  if (!source) {
    throw new FormulaError(`@${node.path.join(".")} is not a collection`, node.index);
  }

  return source;
}

function selectRows(node, context, budget) {
  const source = rowsOf(node.args[0], context);
  const test = node.args[1];

  if (!test) {
    return { source, rows: source.rows };
  }

  const rows = source.rows.filter((row) => {
    budget.tick();
    return boolean(evaluateNode(test, { ...context, item: row }, budget), test);
  });

  return { source, rows };
}

function column(node, context, budget) {
  const { source, rows } = selectRows(node, context, budget);

  if (!source.field) {
    throw new FormulaError(`${node.name}() needs a column such as @${node.args[0].path[0]}.cost`, node.index);
  }

  return rows.map((row) => number(row.get(source.field), node.args[0], `Every ${source.field} in ${node.args[0].path[0]}`));
}

function callFunction(node, context, budget) {
  const { name, args } = node;
  const spec = FUNCTIONS[name];

  if (!spec) {
    throw new FormulaError(`Unknown function ${name}()`, node.index);
  }

  if (args.length < spec.min || args.length > spec.max) {
    throw new FormulaError(`${name}() has the wrong number of arguments`, node.index);
  }

  if (name === "if") {
    const test = boolean(evaluateNode(args[0], context, budget), args[0]);
    return evaluateNode(test ? args[1] : args[2], context, budget);
  }

  if (name === "count") {
    return selectRows(node, context, budget).rows.length;
  }

  const reduces = (name === "min" || name === "max") && args[0].kind === "ref" && context.collection(args[0].path);

  if (name === "sum" || name === "avg" || reduces) {
    const values = column(node, context, budget);

    if (name === "sum") {
      return finite(values.reduce((total, value) => total + value, 0), node);
    }

    if (!values.length) {
      return 0;
    }

    return name === "avg"
      ? finite(values.reduce((total, value) => total + value, 0) / values.length, node)
      : name === "min" ? Math.min(...values) : Math.max(...values);
  }

  if (name === "lookup" || name === "step") {
    return tableLookup(node, context, budget);
  }

  if (name === "index") {
    const found = context.choiceIndex(args[0].path);

    if (found === null || found === undefined) {
      throw new FormulaError(`@${args[0].path.join(".")} is not a choice with a value`, node.index);
    }

    return found;
  }

  if (name === "has") {
    const list = context.list(args[0].path);

    if (!list) {
      throw new FormulaError(`@${args[0].path.join(".")} is not a list`, node.index);
    }

    const wanted = evaluateNode(args[1], context, budget);

    if (typeof wanted !== "string") {
      throw new FormulaError("has() looks for text", args[1].index);
    }

    return list.includes(wanted);
  }

  const values = args.map((argument) => evaluateNode(argument, context, budget));

  switch (name) {
    case "abs":
      return Math.abs(number(values[0], args[0], "abs()"));
    case "ceil":
      return Math.ceil(number(values[0], args[0], "ceil()"));
    case "floor":
      return Math.floor(number(values[0], args[0], "floor()"));
    case "round": {
      const digits = values[1] === undefined ? 0 : number(values[1], args[1], "round()");

      if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
        throw new FormulaError("round() digits must be a whole number from 0 to 10", node.index);
      }

      const factor = 10 ** digits;
      return Math.round(number(values[0], args[0], "round()") * factor) / factor;
    }
    case "min":
    case "max": {
      const numbers = values.map((value, position) => number(value, args[position], `${name}()`));
      return name === "min" ? Math.min(...numbers) : Math.max(...numbers);
    }
    case "clamp": {
      const [value, low, high] = values.map((entry, position) => number(entry, args[position], "clamp()"));

      if (low > high) {
        throw new FormulaError("clamp() has its low above its high", node.index);
      }

      return Math.min(Math.max(value, low), high);
    }
    case "signed": {
      const value = number(values[0], args[0], "signed()");
      return value >= 0 ? `+${formatNumber(value)}` : formatNumber(value);
    }
    case "text":
      return typeof values[0] === "number" ? formatNumber(values[0]) : String(values[0]);
    case "concat":
      return values.map((value) => (typeof value === "number" ? formatNumber(value) : String(value))).join("");
    case "number": {
      const source = values[0];

      if (typeof source !== "string" || !/^-?\d+(\.\d+)?$/.test(source.trim())) {
        throw new FormulaError("number() needs text that looks like a number", node.index);
      }

      return Number(source);
    }
    default:
      throw new FormulaError(`Unknown function ${name}()`, node.index);
  }
}

function tableLookup(node, context, budget) {
  const [nameNode, keyNode, fallbackNode] = node.args;
  const table = context.table(nameNode.value);

  if (!table) {
    throw new FormulaError(`There is no table named "${nameNode.value}"`, nameNode.index);
  }

  const key = evaluateNode(keyNode, context, budget);
  let found;

  if (node.name === "lookup") {
    const text = typeof key === "number" ? formatNumber(key) : String(key);
    found = Object.hasOwn(table, text) ? table[text] : undefined;
  } else {
    const target = number(key, keyNode, "step()");
    let best = -Infinity;

    for (const entryKey of Object.keys(table)) {
      const numeric = Number(entryKey);

      if (Number.isFinite(numeric) && numeric <= target && numeric > best) {
        best = numeric;
        found = table[entryKey];
      }
    }
  }

  if (found !== undefined) {
    return found;
  }

  if (fallbackNode) {
    return evaluateNode(fallbackNode, context, budget);
  }

  throw new FormulaError(`No entry for ${typeof key === "number" ? formatNumber(key) : `"${key}"`} in table "${nameNode.value}"`, node.index);
}

/** Evaluates a parsed formula. Never throws for a bad formula; returns `{ ok, value }` or `{ ok: false, error }`. */
export function evaluateFormula(parsed, context, { steps = FORMULA_LIMITS.steps } = {}) {
  if (!parsed?.ok) {
    return { ok: false, error: parsed?.error ?? { message: "Not a valid formula", index: null } };
  }

  try {
    const value = evaluateNode(parsed.ast, context, new Budget(steps));

    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new FormulaError("The result is not a finite number");
    }

    return { ok: true, value };
  } catch (error) {
    if (error instanceof FormulaError) {
      return { ok: false, error: { message: error.message, index: error.index } };
    }

    if (error instanceof RangeError) {
      return { ok: false, error: { message: "This formula is too deeply nested", index: null } };
    }

    throw error;
  }
}
