import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
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
} from './permissions';

type Role = "owner" | "admin" | "manager" | "cashier" | "technician";
const ALL_ROLES: Role[] = ['owner', 'admin', 'manager', 'cashier', 'technician'];

describe('Permissions checks', () => {
  const testCases = [
    {
      fn: canWriteCatalog,
      name: 'canWriteCatalog',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canUsePos,
      name: 'canUsePos',
      allowed: ['owner', 'admin', 'manager', 'cashier'],
    },
    {
      fn: canProcessReturns,
      name: 'canProcessReturns',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canManageExpenses,
      name: 'canManageExpenses',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canCloseDay,
      name: 'canCloseDay',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canReopenDay,
      name: 'canReopenDay',
      allowed: ['owner', 'admin'],
    },
    {
      fn: canViewReports,
      name: 'canViewReports',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canCreateRepairs,
      name: 'canCreateRepairs',
      allowed: ['owner', 'admin', 'manager', 'cashier', 'technician'],
    },
    {
      fn: canEditRepairs,
      name: 'canEditRepairs',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canUpdateRepairStatus,
      name: 'canUpdateRepairStatus',
      allowed: ['owner', 'admin', 'manager', 'technician'],
    },
    {
      fn: canManageSettings,
      name: 'canManageSettings',
      allowed: ['owner', 'admin'],
    },
    {
      fn: canManageUsers,
      name: 'canManageUsers',
      allowed: ['owner', 'admin'],
    },
    {
      fn: canViewAuditLog,
      name: 'canViewAuditLog',
      allowed: ['owner', 'admin'],
    },
    {
      fn: canManageLossOverride,
      name: 'canManageLossOverride',
      allowed: ['owner', 'admin'],
    },
    {
      fn: canManageSupplierWriteOffs,
      name: 'canManageSupplierWriteOffs',
      allowed: ['owner', 'admin'],
    },
    {
      fn: canManageSupplierPurchases,
      name: 'canManageSupplierPurchases',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canViewReplenishment,
      name: 'canViewReplenishment',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canManageReplenishment,
      name: 'canManageReplenishment',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canOpenShift,
      name: 'canOpenShift',
      allowed: ['owner', 'admin', 'manager'],
    },
    {
      fn: canCloseShift,
      name: 'canCloseShift',
      allowed: ['owner', 'admin', 'manager'],
    },
  ];

  for (const { fn, name, allowed } of testCases) {
    describe(name, () => {
      it('should return true for allowed roles', () => {
        for (const role of allowed) {
          assert.strictEqual(fn(role as Role), true, `Expected ${role} to be allowed`);
        }
      });

      it('should return false for unlisted roles', () => {
        const notAllowed = ALL_ROLES.filter((r) => !allowed.includes(r as string));
        for (const role of notAllowed) {
          assert.strictEqual(fn(role as Role), false, `Expected ${role} to not be allowed`);
        }
      });

      it('should return false for null', () => {
        assert.strictEqual(fn(null), false);
      });

      it('should return false for undefined', () => {
        assert.strictEqual(fn(undefined), false);
      });
    });
  }
});
