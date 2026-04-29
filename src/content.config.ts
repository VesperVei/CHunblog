import { siteConfig } from './config';
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const obsidianDate = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  // Obsidian commonly exports "YYYY-MM-DD HH:mm"; normalize it for Date parsing.
  return value.includes('T') ? value : value.replace(' ', 'T');
}, z.coerce.date());

const articleMetaSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  toc: z.boolean().optional().default(true),
  toc_inline: z.boolean().optional().default(true),
  toc_depth: z.number().int().min(1).max(6).optional(),
  comment: z.boolean().optional().default(true),
  archive: z.string().optional(),
  trigger: z.string().optional(),
  disclaimer: z.string().optional(),
});

const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '**/*/index*.{md,mdx}',
  }),
  schema: ({ image }) =>
    articleMetaSchema.extend({
      description: z.string(),
      created_at: obsidianDate,
      updated_at: obsidianDate.optional(),
      draft: z.boolean().optional().default(false),
      tags: z.array(z.string()).optional().default([]),
      type: z.string().optional(),
      heroImage: image().optional(),
      note_id: z.string().optional(),
      note_type: z.string().optional(),
      aliases: z.array(z.string()).optional().default([]),
      cssclasses: z.array(z.string()).optional(),
      author:
        z.union([
          z.string(),
          z.array(z.string()).min(1)
        ]).default(siteConfig.title)
        .transform((val) => (Array.isArray(val) ? val : [val])),

    }).passthrough(),
});

const pages = defineCollection({
  // Published pages currently live at the content root; keep import sources out of the collection.
  loader: glob({ base: './src/content', pattern: '*.{md,mdx}' }),
  schema: ({ image }) =>
    articleMetaSchema.extend({
      created_at: obsidianDate.optional(),
      updated_at: obsidianDate.optional(),
      tags: z.array(z.string()).optional(),
      note_id: z.string().optional(),
      note_type: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      cssclasses: z.array(z.string()).optional(),
      author:
        z.union([
          z.string(),
          z.array(z.string()).min(1),
        ])
          .optional()
          .transform((val) => (typeof val === 'string' ? [val] : val)),
      heroImage: image().optional(),
    }).passthrough(),
});

export const collections = { blog, pages };
