export type BookableEquipment = {
  id: string;
  name: string;
  rentalPrice: number | string;
  availableStock: number;
};

export function clampEquipmentQuantity(nextQuantity: number, availableStock: number): number {
  return Math.max(0, Math.min(Math.floor(nextQuantity), Math.max(0, availableStock)));
}

export function getEquipmentRentalTotal(equipment: BookableEquipment[], quantities: Record<string, number>): number {
  return equipment.reduce((total, item) => total + (Number(item.rentalPrice) || 0) * clampEquipmentQuantity(quantities[item.id] ?? 0, item.availableStock), 0);
}
