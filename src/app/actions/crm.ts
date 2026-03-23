'use server'

import { getDbConnection } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";

async function requireGoogleSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }
  return session;
}

// 1. Log a call disposition and update business status
export async function logDisposition(businessId: number, newStatus: string) {
  await requireGoogleSession();
  const db = getDbConnection();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Update Business Status and Timestamp
    await connection.execute(
      'UPDATE businesses SET status = ?, last_called_ts = NOW() WHERE id = ?',
      [newStatus, businessId]
    );

    // Insert System Note
    const noteBody = `Status changed to ${newStatus}`;
    await connection.execute(
      'INSERT INTO notes (business_id, body, is_system_generated) VALUES (?, ?, 1)',
      [businessId, noteBody]
    );

    await connection.commit();
    revalidatePath('/'); // Triggers UI refresh instantly
    return { success: true };

  } catch (error) {
    await connection.rollback();
    console.error("Disposition failed:", error);
    return { success: false, error: "Atomic update failed" };
  } finally {
    connection.release();
  }
}

// 2. Add a manual conversation note
export async function addManualNote(businessId: number, body: string) {
  await requireGoogleSession();
  const db = getDbConnection();
  try {
    await db.execute(
      'INSERT INTO notes (business_id, body, is_system_generated) VALUES (?, ?, 0)',
      [businessId, body]
    );
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error("Manual note failed:", error);
    return { success: false };
  }
}

// 3. Toggle a phone number as "Dead"
export async function togglePhoneDead(phoneId: number, currentIsDead: boolean) {
  await requireGoogleSession();
  const db = getDbConnection();
  try {
    // If it's currently dead (1), make it alive (0). Vice versa.
    const newStatus = currentIsDead ? 0 : 1;
    await db.execute('UPDATE phones SET is_dead = ? WHERE id = ?', [newStatus, phoneId]);
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error("Toggle phone failed:", error);
    return { success: false };
  }
}