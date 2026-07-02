import { z } from 'zod';

export const publicAssetSchema = z.object({
  url: z.string().url(),
  rightsStatus: z.enum(['owned', 'licensed', 'authorized']),
});

export const menuItemSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().min(1),
  subtitle: z.string().optional(),
  basePriceCents: z.number().int().nonnegative(),
  caloriesKcal: z.number().int().positive(),
  calorieSource: z.object({
    type: z.enum(['official', 'composition_estimate']),
    description: z.string().min(1),
    referenceUrl: z.string().url(),
  }),
  monthlySales: z.number().int().nonnegative(),
  sourceType: z.enum(['original', 'licensed', 'authorized', 'derived']),
});
