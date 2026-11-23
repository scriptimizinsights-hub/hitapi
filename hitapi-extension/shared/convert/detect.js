/**
 * shared/convert/detect.js — what kind of file is this? (roadmap feature 10)
 * JSON or YAML text → { format, data } where format is one of:
 *   'hitapi' | 'postman' | 'postman-env' | 'openapi' | 'har' | 'insomnia' | 'curl'
 */

import yaml from '../../lib/js-yaml.mjs';
import { looksLikeCurl } from '../curl.js';
import { FORMAT } from '../collections.js';
import { isPostmanCollection, isPostmanEnvironment } from './postman.js';
import { isOpenApi } from './openapi.js';
import { isHar } from './har.js';
import { isInsomnia } from './insomnia.js';

export const FORMAT_LABELS = {
  hitapi: 'HitAPI collection', postman: 'Postman collection', 'postman-env': 'Postman environment',
  openapi: 'OpenAPI / Swagger', har: 'HAR (recorded traffic)', insomnia: 'Insomnia export', curl: 'cURL command',
};

export function detectFormat(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  if (!t) throw new Error('Nothing to import: the file or text is empty.');
  if (looksLikeCurl(t)) return { format: 'curl', data: t };
  let data;
  if (/^[[{]/.test(t)) { try { data = JSON.parse(t); } catch (e) { throw new Error(`This looks like JSON but can't be read: ${e.message}`); } }
  else {
    try { data = yaml.load(t); } catch (e) { throw new Error(`This is neither JSON nor YAML: ${String(e.message).split('\n')[0]}`); }
  }
  if (data?.format === FORMAT && data.collection) return { format: 'hitapi', data };
  if (isPostmanCollection(data)) return { format: 'postman', data };
  if (isOpenApi(data)) return { format: 'openapi', data };
  if (isHar(data)) return { format: 'har', data };
  if (isInsomnia(data)) return { format: 'insomnia', data };
  if (isPostmanEnvironment(data)) return { format: 'postman-env', data };
  if (data?.info?.schema && /getpostman/.test(data.info.schema)) throw new Error('This Postman collection version isn\'t supported. Export it from Postman as "Collection v2.1".');
  if (data?.swagger && data.swagger !== '2.0') throw new Error(`Swagger ${data.swagger} isn't supported. Use Swagger 2.0 or OpenAPI 3.`);
  throw new Error('This file isn\'t one HitAPI can import. Supported: Postman collections and environments (v2.0/v2.1), OpenAPI 3 and Swagger 2 (JSON or YAML), HAR, Insomnia (v4) and HitAPI collection files, and cURL commands.');
}
