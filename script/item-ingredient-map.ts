import { PrismaClient, Prisma } from "@prisma/client";
import { DefaultArgs } from "@prisma/client/runtime/library";
import fs from 'fs';
import csv from 'csv-parser';

export async function itemIngredientMap(
    itemMap: Array<{
        oldId: string,
        newId: string
    }>,
    ingredientMap: Array<{
        oldId: string,
        newId: string
    }>,
    itemIngredientsCsv: string,
    prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
) {
    const results: any[] = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(itemIngredientsCsv)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                try {
                    await Promise.all(results.map(async (row) => {
                        const newIngredient = ingredientMap.find((ingredient) => ingredient.oldId === row.ingredientId);
                        const newItem = itemMap.find((item) => item.oldId === row.itemId);
                        if (!newIngredient?.newId) {
                            console.error(`Ingredient not found for oldId: ${row.ingredientId}`);
                            return;
                        }
                        if (!newItem?.newId) {
                            console.error(`Menu item not found for oldId: ${row.itemId}`);
                            return;
                        }

                        await prisma.menuItemIngredient.create({
                            data: {
                                ingredientId: newIngredient.newId,
                                menuItemId: newItem.newId,
                                assignedAt: new Date(),
                                quantity: 1,
                                unit: "",
                                price: 0.00,
                            },
                        })
                    }));
                    console.log(`Item ingredient migrated!`);
                    resolve(true);
                } catch (error) {
                    console.error('Error migrating categories:', error);
                    reject(error);
                }
            });
    });
}