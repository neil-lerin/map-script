import fs from 'fs';
import csv from 'csv-parser';
export async function dietaryRestrictionMap(itemMap, restrictionsMap, restrictionsCsv, prisma) {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(restrictionsCsv)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
            try {
                await Promise.all(results.map(async (row) => {
                    const newRestrictions = restrictionsMap.find((restriction) => restriction.oldId === row.restrictionId);
                    const newItem = itemMap.find((item) => item.oldId === row.itemId);
                    if (!newRestrictions?.newId) {
                        console.error(`Ingredient not found for oldId: ${row.restrictionid}`);
                        return;
                    }
                    if (!newItem?.newId) {
                        console.error(`Menu item not found for oldId: ${row.itemId}`);
                        return;
                    }
                    await prisma.menuItemDietaryWarning.create({
                        data: {
                            dietaryWarningId: newRestrictions.newId,
                            menuItemId: newItem.newId,
                            assignedAt: new Date(),
                        },
                    });
                }));
                console.log(`Menu Item warning migrated!`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating categories:', error);
                reject(error);
            }
        });
    });
}
