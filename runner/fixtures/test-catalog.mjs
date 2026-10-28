// test-catalog.mjs: imported first by the tests that plan scenes, so the
// scene catalog is the fixture (runner/fixtures/catalog.json) and not the
// real one, whose "on" list follows the test renders (DECISIONS 130).
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ITV_CATALOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "catalog.json");
