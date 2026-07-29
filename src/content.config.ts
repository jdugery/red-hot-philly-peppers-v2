import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const peppers = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/peppers",
  }),

  schema: z.object({
    name: z.string(),
    species: z.string(),
    heat: z.string(),
    color: z.string().optional(),
    description: z.string(),

    image: z.string().optional(),

    gallery: z.array(z.string()).default([]),

    available: z.boolean().default(false),
    seedPrice: z.number().positive().optional(),
    seedQuantity: z.string().optional(),

    // Allows regular URLs, mailto links, or your current email instruction text
    purchaseUrl: z.string().optional(),

    flavor: z.string().optional(),
    daysToMaturity: z.string().optional(),
    plantHabit: z.string().optional(),
  }),
});

const home = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/home",
  }),

  schema: z.object({
    eyebrow: z.string(),
    headline: z.string(),
    description: z.string(),
    aboutTitle: z.string(),
    aboutText: z.string(),
    contactTitle: z.string(),
    contactText: z.string(),
  }),
});

export const collections = {
  peppers,
  home,
};