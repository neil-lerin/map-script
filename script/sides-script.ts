import { PrismaClient, Prisma } from "@prisma/client";
import { DefaultArgs } from "@prisma/client/runtime/library";
import fs from 'fs';
import csv from 'csv-parser';

export async function itemSideScript(
    itemMap: Array<{
        oldId: string,
        newId: string
    }>,

    sidesCsv: string,
    prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
) {
    const results: any[] = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(sidesCsv)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                try {
                    await Promise.all(results.map(async (row) => {
                        const currentItem = itemMap.find((item) => item.oldId === row.itemId);
                        const pairedToItem = itemMap.find((item) => item.oldId === row.addonId);

                        if (!pairedToItem) {
                            console.error(`Paired to Item not found!`);
                            return;
                        }

                        if (!currentItem) {
                            console.error(`Current Item not found!`);
                            return;
                        }
                        await prisma.menuItemPairing.create({
                            data: {
                                menuItemId: currentItem.newId,
                                pairedMenuItemId: pairedToItem.newId
                            }
                        })
                    }));
                    console.log(`Sides Migrated`);
                    resolve(true);
                } catch (error) {
                    console.error('Error migrating categories:', error);
                    reject(error);
                }
            });
    });
}