import assert from "node:assert/strict";
import test from "node:test";
import { ErroUpload, decodificarImagem, mimeDaImagem } from "../src/lib/imagem.js";

const jpegMinimo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

test("reconhece a assinatura de uma imagem JPEG", () => {
  assert.equal(mimeDaImagem(jpegMinimo), "image/jpeg");
});

test("recusa texto base64 inválido", () => {
  assert.throws(() => decodificarImagem("não é base64", "image/jpeg"), ErroUpload);
});

test("recusa tipo declarado diferente do conteúdo", () => {
  assert.throws(() => decodificarImagem(jpegMinimo.toString("base64"), "image/png"), ErroUpload);
});

test("aceita data URL com o mesmo MIME do arquivo", () => {
  const dataUrl = `data:image/jpeg;base64,${jpegMinimo.toString("base64")}`;
  assert.deepEqual(decodificarImagem(dataUrl, "image/jpeg"), jpegMinimo);
});
