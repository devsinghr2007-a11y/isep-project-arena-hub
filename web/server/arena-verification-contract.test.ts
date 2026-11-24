import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260826_arenahub_verification_workflow.sql"), "utf8");
const slotSafeguardMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260826_arenahub_owner_slot_safeguards.sql"), "utf8");
const discoverySource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const workflowSource = readFileSync(resolve(process.cwd(), "client/src/pages/VerificationWorkflow.tsx"), "utf8");
const ownerManagementSource = readFileSync(resolve(process.cwd(), "client/src/pages/OwnerArenaManagement.tsx"), "utf8");

describe("ArenaHub verification security contract", () => {
  it("limits administrator authority to the designated confirmed Supabase identity", () => {
    expect(migration).toContain("deepak843161.438@gmail.com");
    expect(migration).toContain("u.email_confirmed_at is not null");
    expect(migration).toContain("and p.role = 'ADMIN'");
    expect(migration).toContain("profile role is controlled by the secure ArenaHub workflow");
    expect(migration).toContain("request_arena_owner_role");
  });

  it("keeps owner submissions and verification transitions behind secure database functions", () => {
    expect(migration).toContain("submit_arena_for_review");
    expect(migration).toContain("transition_arena_verification");
    expect(migration).toContain("arena verification status is controlled by secure submission and admin-review functions");
    expect(migration).toContain("create trigger prevent_direct_arena_status_change");
    expect(migration).toContain("arenas_strict_verification_lifecycle");
    expect(migration).toContain("approval checklist item");
    expect(migration).toContain("arena_verification_history");
  });

  it("restricts browser discovery queries to approved arenas", () => {
    expect(discoverySource).toContain('.eq("verification_status", "APPROVED")');
    expect(migration).toContain("storage_read_approved_arena_images");
    expect(migration).toContain("arena.verification_status = 'APPROVED'");
    expect(migration).toContain("enforce_approved_arena_commerce");
    expect(migration).toContain("enforce_approved_booking_arena");
    expect(migration).toContain("enforce_approved_event_arena");
  });

  it("keeps owner resubmission and administrative actions on the protected RPC boundary", () => {
    expect(workflowSource).toContain('rpc("submit_arena_for_review"');
    expect(workflowSource).toContain('rpc("transition_arena_verification"');
    expect(workflowSource).toContain('insert({ ...payload, verification_status: "DRAFT" })');
    expect(workflowSource).toContain('update(payload).eq("id", arenaId)');
    expect(workflowSource).toContain('<SecureGate roles={["ADMIN"]}>');
  });

  it("keeps owner editing prefilled and only permits slot changes outside held or booked activity", () => {
    expect(workflowSource).toContain('requestedArenaId');
    expect(workflowSource).toContain('verification_status", ["DRAFT", "CHANGES_REQUESTED", "REJECTED"]');
    expect(ownerManagementSource).toContain("isOwnerMutableSlot");
    expect(ownerManagementSource).toContain('eq("owner_id", profile.id)');
    expect(slotSafeguardMigration).toContain("protect_committed_arena_slots");
    expect(slotSafeguardMigration).toContain("held and booked arena slots cannot be changed by an arena owner");
    expect(slotSafeguardMigration).toContain("held and booked arena slots are controlled by the secure booking workflow");
  });
});
