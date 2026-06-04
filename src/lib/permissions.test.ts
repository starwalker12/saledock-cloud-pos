import { describe, expect, it } from "vitest";

import {
  Role,
  canWriteCatalog,
  canUsePos,
  canProcessReturns,
  canManageExpenses,
  canCloseDay,
  canReopenDay,
  canViewReports,
  canCreateRepairs,
  canEditRepairs,
  canUpdateRepairStatus,
  canManageSettings,
  canManageUsers,
  canViewAuditLog,
  canManageLossOverride,
  canManageSupplierWriteOffs,
  canManageSupplierPurchases,
  canViewReplenishment,
  canManageReplenishment,
  canOpenShift,
  canCloseShift,
} from "./permissions";

describe("Permissions", () => {
  const ALL_ROLES: Role[] = ["owner", "admin", "manager", "cashier", "technician"];

  function runPermissionTest(
    permissionFn: (role: Role | null | undefined) => boolean,
    allowedRoles: Role[]
  ) {
    it("should allow permitted roles", () => {
      for (const role of allowedRoles) {
        expect(permissionFn(role)).toBe(true);
      }
    });

    it("should deny unpermitted roles", () => {
      const deniedRoles = ALL_ROLES.filter((r) => !allowedRoles.includes(r));
      for (const role of deniedRoles) {
        expect(permissionFn(role)).toBe(false);
      }
    });

    it("should deny null or undefined roles", () => {
      expect(permissionFn(null)).toBe(false);
      expect(permissionFn(undefined)).toBe(false);
    });
  }

  describe("canWriteCatalog", () => {
    runPermissionTest(canWriteCatalog, ["owner", "admin", "manager"]);
  });

  describe("canUsePos", () => {
    runPermissionTest(canUsePos, ["owner", "admin", "manager", "cashier"]);
  });

  describe("canProcessReturns", () => {
    runPermissionTest(canProcessReturns, ["owner", "admin", "manager"]);
  });

  describe("canManageExpenses", () => {
    runPermissionTest(canManageExpenses, ["owner", "admin", "manager"]);
  });

  describe("canCloseDay", () => {
    runPermissionTest(canCloseDay, ["owner", "admin", "manager"]);
  });

  describe("canReopenDay", () => {
    runPermissionTest(canReopenDay, ["owner", "admin"]);
  });

  describe("canViewReports", () => {
    runPermissionTest(canViewReports, ["owner", "admin", "manager"]);
  });

  describe("canCreateRepairs", () => {
    runPermissionTest(canCreateRepairs, ["owner", "admin", "manager", "cashier", "technician"]);
  });

  describe("canEditRepairs", () => {
    runPermissionTest(canEditRepairs, ["owner", "admin", "manager"]);
  });

  describe("canUpdateRepairStatus", () => {
    runPermissionTest(canUpdateRepairStatus, ["owner", "admin", "manager", "technician"]);
  });

  describe("canManageSettings", () => {
    runPermissionTest(canManageSettings, ["owner", "admin"]);
  });

  describe("canManageUsers", () => {
    runPermissionTest(canManageUsers, ["owner", "admin"]);
  });

  describe("canViewAuditLog", () => {
    runPermissionTest(canViewAuditLog, ["owner", "admin"]);
  });

  describe("canManageLossOverride", () => {
    runPermissionTest(canManageLossOverride, ["owner", "admin"]);
  });

  describe("canManageSupplierWriteOffs", () => {
    runPermissionTest(canManageSupplierWriteOffs, ["owner", "admin"]);
  });

  describe("canManageSupplierPurchases", () => {
    runPermissionTest(canManageSupplierPurchases, ["owner", "admin", "manager"]);
  });

  describe("canViewReplenishment", () => {
    runPermissionTest(canViewReplenishment, ["owner", "admin", "manager"]);
  });

  describe("canManageReplenishment", () => {
    runPermissionTest(canManageReplenishment, ["owner", "admin", "manager"]);
  });

  describe("canOpenShift", () => {
    runPermissionTest(canOpenShift, ["owner", "admin", "manager"]);
  });

  describe("canCloseShift", () => {
    runPermissionTest(canCloseShift, ["owner", "admin", "manager"]);
  });
});
