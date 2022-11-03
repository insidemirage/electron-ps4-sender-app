/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const CONTENT_ID_OFFSET = parseInt('00000040', 16);
const usedIds: string[] = [];

export function resolveHtmlPath(htmlFileName: string) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
}

export const readContentIdFromFile = (file: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(file, {
      highWaterMark: 256,
      start: CONTENT_ID_OFFSET,
    });
    fileStream
      .on('error', (err) => reject(err))
      .on('data', (chunk) => {
        try {
          fileStream.destroy();
          resolve(chunk.toString(undefined, undefined, chunk.indexOf(0)));
        } catch (e) {
          fileStream.destroy();
          reject(e);
        }
      });
  });
};

export const generateId = (): string => {
  const id = uuidv4();
  if (usedIds.indexOf(id) !== -1) {
    return generateId();
  }
  usedIds.push(id);
  return id;
};
