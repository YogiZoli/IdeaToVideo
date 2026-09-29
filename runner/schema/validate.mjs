// validate.mjs: a small JSON Schema subset validator, so the runner needs no
// dependencies. Supported keywords: type (string or array), required,
// properties, additionalProperties (false or a schema), items, enum, const,
// minLength, maxLength, minimum, maximum, minItems, maxItems, pattern, and
// $ref to "#/definitions/<name>" inside the same schema.
// Anything imported from a file (brief card, preset) goes through this before
// it is used, and is treated as data, never as instructions (SPEC 9).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(here, `${name}.schema.json`), "utf8"));
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function typeMatches(actual, wanted) {
  return actual === wanted || (wanted === "number" && actual === "integer");
}

// Returns a list of "path: message" strings; empty means valid.
export function validate(value, schema, at = "$", root = schema) {
  if (schema.$ref) {
    const m = /^#\/definitions\/(.+)$/.exec(schema.$ref);
    const target = m && root.definitions?.[m[1]];
    if (!target) return [`${at}: unresolved ${schema.$ref}`];
    return validate(value, target, at, root);
  }
  const errors = [];
  const t = typeOf(value);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((w) => typeMatches(t, w))) {
      errors.push(`${at}: expected ${types.join(" or ")}, got ${t}`);
      return errors;
    }
  }
  if ("const" in schema && value !== schema.const) errors.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: must be one of ${schema.enum.join(", ")}`);
  if (t === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if (t === "number" || t === "integer") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`);
  }
  if (t === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, `${at}[${i}]`, root)));
  }
  if (t === "object") {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${at}: missing ${k}`);
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errors.push(...validate(v, props[k], `${at}.${k}`, root));
      else if (schema.additionalProperties === false) errors.push(`${at}: unknown field ${k}`);
      else if (typeof schema.additionalProperties === "object") errors.push(...validate(v, schema.additionalProperties, `${at}.${k}`, root));
    }
  }
  return errors;
}
