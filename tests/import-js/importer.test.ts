// Testes do leitor de folhas (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoMap, expandSizes, findHeaderRow, linesFromTable, parseCsv, parseMoney, toImportRows } from "../../web/lib/admin/importer.ts";

test("tamanhos", () => {
  assert.deepEqual(expandSizes("35 a 38"), ["35", "36", "37", "38"]);
  assert.deepEqual(expandSizes("35/6 a 41/2"), ["35/36", "37/38", "39/40", "41/42"]);
  assert.deepEqual(expandSizes("1 a 5"), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(expandSizes("S, M,L"), ["S", "M", "L"]);
  assert.deepEqual(expandSizes("S/M/L"), ["S", "M", "L"]);
  assert.deepEqual(expandSizes("S a XL"), ["S", "M", "L", "XL"]);
  assert.deepEqual(expandSizes("39-44"), ["39", "40", "41", "42", "43", "44"]);
  assert.deepEqual(expandSizes("35-37"), ["35-37"]);
  assert.deepEqual(expandSizes("35-37 38-40 41-43"), ["35-37", "38-40", "41-43"]);
  assert.deepEqual(expandSizes("35/36"), ["35/36"]);
  assert.deepEqual(expandSizes(""), ["Único"]);
  assert.deepEqual(expandSizes("Único"), ["Único"]);
});

test("preços", () => {
  assert.equal(parseMoney("32,70"), 3270);
  assert.equal(parseMoney("€ 1.032,70"), 103270);
  assert.equal(parseMoney("1,032.70"), 103270);
  assert.equal(parseMoney(9.9), 990);
  assert.equal(parseMoney("—"), null);
});

test("folha CSV com cabeçalho na linha 3 e células unidas", () => {
  const csv = "Tabela de preços 2026;;;;\n;;;;\nReferência;Designação;Cor;Tamanhos;Preço;PVP\nWG4A.03;BERLIM;Azul;35 a 37;32,70;61,90\n;;Branco;35 a 36;;\nMN21;Meia Descanso;Bege;1 a 2;7,45;9,90\n";
  const rows = parseCsv(csv);
  const h = findHeaderRow(rows);
  assert.equal(h, 2);
  const m = autoMap(rows[h]);
  assert.deepEqual([m.model_ref, m.title, m.color, m.size, m.cost, m.rrp], [0, 1, 2, 3, 4, 5]);
  const out = toImportRows(linesFromTable(rows, h, m));
  assert.equal(out.length, 3 + 2 + 2);
  assert.equal(out[0].title, "Berlim Azul");
  assert.equal(out[3].model_ref, "WG4A.03");      // herdou referência e preço da linha de cima
  assert.equal(out[3].cost_cents, 3270);
  assert.equal(out[3].color, "Branco");
  assert.equal(out[5].supplier_sku, "MN21-1");
});

test("tabela Nursing Care: o leitor dá exatamente as linhas do extrator de PDF (3897 tamanhos)", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  const rows = parseCsv(readFileSync(new URL("nursing_care_2026.csv", dir), "utf8"));
  const h = findHeaderRow(rows);
  const out = toImportRows(linesFromTable(rows, h, autoMap(rows[h])));
  const expected = readFileSync(new URL("nursing_care_2026.expected.txt", dir), "utf8").trim().split("\n");
  const got = [...new Set(out.map((r) => `${r.model_ref}|${r.size}|${r.cost_cents}|${r.rrp_cents ?? "null"}`))].sort();
  assert.equal(out.length, 3897);
  assert.deepEqual(got.filter((x) => !expected.includes(x)), []);
  assert.deepEqual(expected.filter((x) => !got.includes(x)), []);
});
