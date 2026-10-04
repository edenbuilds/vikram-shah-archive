import test from "node:test";
import assert from "node:assert/strict";
import { spelledDifferently } from "./spelling.ts";

const title = "Mr. Vikram Shah v. Mrs. Riva Trindade & Ors.";
test("a swapped-letter spelling of a party is reported, with the matter's own spelling", () => {
  assert.deepEqual(spelledDifferently("The Statement of Claim names Mr. Vikarm Shah as the Claimant.", title), [["Vikarm", "Vikram"]]);
});
test("exact spellings, other names and ordinary words are left alone", () => {
  assert.deepEqual(spelledDifferently("Mr. Vikram Shah and Mrs. Albertina Trindade filed the Statement of Claim.", title), []);
});
test("a dropped letter counts too", () => {
  assert.deepEqual(spelledDifferently("Respondent No. 1 is Mrs. Riva Trinade.", title), [["Trinade", "Trindade"]]);
});
