/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import fs from 'node:fs/promises'
import path from 'node:path'

const translations = {
  en: { Music: 'Music' },
  zh: { Music: '音乐' },
  'zh-TW': { Music: '音樂' },
  fr: { Music: 'Musique' },
  ru: { Music: 'Музыка' },
  ja: { Music: '音楽' },
  vi: { Music: 'Âm nhạc' },
}

for (const [locale, additions] of Object.entries(translations)) {
  const file = path.resolve(`src/i18n/locales/${locale}.json`)
  const messages = JSON.parse(await fs.readFile(file, 'utf8'))
  await fs.writeFile(
    file,
    `${JSON.stringify({ ...messages, ...additions }, null, 2)}\n`
  )
}
