import type { BillIssue, BillWrite } from "./schemas.js";

/**
 * Rules a bill must satisfy before it can be saved.
 * Item subtotal is the sum of line totals. The bill total is
 * subtotal + tax + service charge - discount + rounding. Every item needs
 * at least one payer.
 */
export function validateBillWrite(bill: BillWrite): BillIssue[] {
  const issues: BillIssue[] = [];
  const itemIds = new Set<string>();
  const payerIds = new Set<string>();

  for (const item of bill.items) {
    if (itemIds.has(item.id)) {
      issues.push({
        code: "DUPLICATE_ITEM_ID",
        message: `Item id "${item.id}" is duplicated`,
        itemId: item.id,
      });
    }
    itemIds.add(item.id);
  }

  for (const payer of bill.payers) {
    if (payerIds.has(payer.id)) {
      issues.push({
        code: "DUPLICATE_PAYER_ID",
        message: `Payer id "${payer.id}" is duplicated`,
        payerId: payer.id,
      });
    }
    payerIds.add(payer.id);
  }

  const seenAssignments = new Set<string>();
  const assignedItems = new Set<string>();

  for (const assignment of bill.assignments) {
    if (!itemIds.has(assignment.itemId)) {
      issues.push({
        code: "UNKNOWN_ITEM",
        message: `Assignment references unknown item "${assignment.itemId}"`,
        itemId: assignment.itemId,
      });
    }
    if (!payerIds.has(assignment.payerId)) {
      issues.push({
        code: "UNKNOWN_PAYER",
        message: `Assignment references unknown payer "${assignment.payerId}"`,
        payerId: assignment.payerId,
      });
    }
    const key = `${assignment.itemId}:${assignment.payerId}`;
    if (seenAssignments.has(key)) {
      issues.push({
        code: "DUPLICATE_ASSIGNMENT",
        message: `Item "${assignment.itemId}" is assigned to payer "${assignment.payerId}" more than once`,
        itemId: assignment.itemId,
        payerId: assignment.payerId,
      });
    }
    seenAssignments.add(key);
    if (itemIds.has(assignment.itemId) && payerIds.has(assignment.payerId)) {
      assignedItems.add(assignment.itemId);
    }
  }

  for (const item of bill.items) {
    if (!assignedItems.has(item.id)) {
      issues.push({
        code: "UNASSIGNED_ITEM",
        message: `Item "${item.name}" is not assigned to a payer`,
        itemId: item.id,
      });
    }
  }

  const lineSum = bill.items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (lineSum !== bill.subtotal) {
    issues.push({
      code: "SUBTOTAL_MISMATCH",
      message: `Subtotal ${bill.subtotal} does not equal the sum of line totals ${lineSum}`,
    });
  }

  const expectedTotal = bill.subtotal + bill.tax + bill.serviceCharge - bill.discount + bill.rounding;
  if (expectedTotal !== bill.total) {
    issues.push({
      code: "TOTAL_MISMATCH",
      message: `Total ${bill.total} does not equal subtotal + tax + service charge - discount + rounding (${expectedTotal})`,
    });
  }

  return issues;
}
