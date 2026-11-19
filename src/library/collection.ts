import type { Reference } from './reference'

const studies = [
  {
    slug: 'terracotta-pitcher',
    title: 'Terracotta pitcher',
    subject: 'Still life',
    note: 'Look at the space inside the handle. Its shape is as useful as the outline of the pitcher.',
  },
  {
    slug: 'pear-study',
    title: 'A pair of pears',
    subject: 'Botanical',
    note: 'Compare the tilt of each stem before drawing the curves of the fruit.',
  },
  {
    slug: 'nautilus-shell',
    title: 'Nautilus shell',
    subject: 'Natural form',
    note: 'Find the large curve of the shell before following its smaller ridges.',
  },
  {
    slug: 'wooden-hand',
    title: 'Articulated hand',
    subject: 'Figure study',
    note: 'Mark the joints first. They give each finger a clear direction and length.',
  },
]

export const collection: Reference[] = studies.map((study) => ({
  id: 'studio/' + study.slug,
  title: study.title,
  subject: study.subject,
  note: study.note,
  width: 768,
  height: 512,
  source: 'studio',
  url: '/studies/' + study.slug + '.webp',
  creator: 'Traceit Studio',
  license: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
}))
