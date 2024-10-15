import fs from 'fs';
import csv from 'csv-parser';
import { findIngredient } from "./find-ingredient.js";
export async function itemIngredient(oldItemId, newItemId, itemIngredientsCsv, userId, languages, ingredientsCsv, prisma) {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(itemIngredientsCsv)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
            try {
                const item = results.filter((item) => item.itemId === oldItemId);
                await Promise.all(item.map(async (row) => {
                    const ingredient = await findIngredient(row.ingredientId, ingredientsCsv);
                    const translations = [];
                    if (ingredient) {
                        if (languages.length > 0) {
                            if (languages.length === 1) {
                                const lang = languages[0];
                                translations.push({
                                    lang: lang,
                                    name: ingredient.name,
                                });
                            }
                            else {
                                languages.forEach(lang => {
                                    if (lang === 'pt') {
                                        translations.push({
                                            lang: 'pt',
                                            name: ingredient.name,
                                        });
                                    }
                                    else if (lang === 'en') {
                                        translations.push({
                                            lang: 'en',
                                            name: ingredient.name_ol,
                                        });
                                    }
                                });
                            }
                        }
                        const newIngredient = await prisma.ingredient.create({
                            data: {
                                isGlobal: false,
                                userId: userId,
                                ingredientTranslation: {
                                    createMany: {
                                        data: translations.length > 0 ? translations : [],
                                    },
                                },
                            },
                        });
                        await prisma.menuItemIngredient.create({
                            data: {
                                ingredientId: newIngredient.id,
                                menuItemId: newItemId,
                                assignedAt: new Date(),
                                quantity: 1,
                                unit: "",
                                price: 0.00,
                            },
                        });
                    }
                }));
                console.log(`Item ingredient migrated!`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating item ingredient:', error);
                reject(error);
            }
        });
    });
}
