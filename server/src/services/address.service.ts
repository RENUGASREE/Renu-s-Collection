/**
 * ============================================================================
 * Address Service (Phase 3D: PostgreSQL Migration)
 * ============================================================================
 *
 * Implements customer shipping and billing address management backed by the
 * `user_addresses` table on Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. ACID transactions for default address updates and cascading default assignments.
 * 2. Strict ownership verification ensuring customers can only access/modify their own addresses.
 * 3. Validation of Indian PIN codes (6 digits) and phone numbers (10/12 digits).
 * 4. Dual ID compatibility (`id` and `_id`) for frontend and order processing compatibility.
 * 5. Full preservation of address schemas and existing customer addresses.
 */

import { PostgresAddressRepository } from "../repositories/postgres-address.repository.js";
import { PostgresUserRepository } from "../repositories/postgres-user.repository.js";
import { PostgresDatabase, withTransaction } from "../db/postgres.js";
import { IDbPool, IDbClient, IUserAddressRecord } from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";
import { isValidEntityId } from "../utils/helpers.js";

export interface AddressInput {
  label?: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  phone: string;
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Singletons & Dependency Injection
// ---------------------------------------------------------------------------

let activeAddressRepo: PostgresAddressRepository | null = null;
let activeUserRepo: PostgresUserRepository | null = null;
let activePool: IDbPool | null = null;

function getAddressRepo(): PostgresAddressRepository {
  if (!activeAddressRepo) {
    activeAddressRepo = new PostgresAddressRepository(getAddressPool());
  }
  return activeAddressRepo;
}

function getUserRepo(): PostgresUserRepository {
  if (!activeUserRepo) {
    activeUserRepo = new PostgresUserRepository(getAddressPool());
  }
  return activeUserRepo;
}

function getAddressPool(): IDbPool {
  if (!activePool) {
    activePool = PostgresDatabase.getPool();
  }
  return activePool;
}

export function setAddressRepository(repo: PostgresAddressRepository): void {
  activeAddressRepo = repo;
}

export function setAddressUserRepository(repo: PostgresUserRepository): void {
  activeUserRepo = repo;
}

export function setAddressDatabasePool(pool: IDbPool): void {
  activePool = pool;
  activeAddressRepo = new PostgresAddressRepository(pool);
  activeUserRepo = new PostgresUserRepository(pool);
}

// Helper to determine if an object is a transaction client
function isDbClient(target: any): target is IDbClient {
  return target && typeof target.query === "function" && typeof target.connect !== "function";
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function validateAddressData(addressData: Partial<AddressInput>, isNew = false): void {
  if (isNew) {
    if (
      !addressData.fullName ||
      !addressData.line1 ||
      !addressData.city ||
      !addressData.state ||
      !addressData.postalCode ||
      !addressData.phone
    ) {
      throw new AppError("Missing required address fields", 400);
    }
  }

  // Validate Indian PIN code (6 digits)
  if (addressData.postalCode !== undefined) {
    if (!/^\d{6}$/.test(addressData.postalCode.trim())) {
      throw new AppError("Invalid Indian PIN code (must be 6 digits)", 400);
    }
  }

  // Validate Indian phone number (10 digits, optionally with +91 prefix)
  if (addressData.phone !== undefined) {
    const phoneDigits = addressData.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10 && phoneDigits.length !== 12) {
      throw new AppError("Invalid phone number", 400);
    }
  }
}

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

/**
 * Retrieves all saved addresses for a user.
 */
export async function getUserAddresses(
  userId: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<IUserAddressRecord[]> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  const client = isDbClient(clientOrPool) ? clientOrPool : undefined;
  const user = await getUserRepo().findById(userId, client);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  return getAddressRepo().findByUserId(userId, client);
}

/**
 * Creates a new address for a user.
 * Automatically marks as default if it is the user's first address or explicitly set as default.
 */
export async function createAddress(
  userId: string,
  addressData: Partial<AddressInput>,
  clientOrPool?: IDbClient | IDbPool
): Promise<IUserAddressRecord> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  validateAddressData(addressData, true);

  const executeCreate = async (client: IDbClient) => {
    const user = await getUserRepo().findById(userId, client);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const count = await getAddressRepo().countByUserId(userId, client);
    const shouldBeDefault = count === 0 || Boolean(addressData.isDefault);

    if (shouldBeDefault) {
      await getAddressRepo().clearDefaultsForUser(userId, client);
    }

    return getAddressRepo().create(
      {
        userId,
        label: addressData.label?.trim() || undefined,
        fullName: addressData.fullName!.trim(),
        line1: addressData.line1!.trim(),
        line2: addressData.line2?.trim() || undefined,
        city: addressData.city!.trim(),
        state: addressData.state!.trim(),
        postalCode: addressData.postalCode!.trim(),
        country: addressData.country?.trim() || "India",
        phone: addressData.phone!.trim(),
        isDefault: shouldBeDefault,
      },
      client
    );
  };

  if (isDbClient(clientOrPool)) {
    return executeCreate(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getAddressPool();
  return withTransaction(pool, executeCreate);
}

/**
 * Updates an existing address for a user.
 */
export async function updateAddress(
  userId: string,
  addressId: string,
  addressData: Partial<AddressInput>,
  clientOrPool?: IDbClient | IDbPool
): Promise<IUserAddressRecord> {
  if (!isValidEntityId(userId) || !isValidEntityId(addressId)) {
    throw new AppError("Invalid user or address id", 400);
  }

  validateAddressData(addressData, false);

  const executeUpdate = async (client: IDbClient) => {
    const existing = await getAddressRepo().findByIdAndUserId(addressId, userId, client);
    if (!existing) {
      throw new AppError("Address not found", 404);
    }

    if (addressData.isDefault) {
      await getAddressRepo().clearDefaultsForUser(userId, client);
    }

    const updated = await getAddressRepo().updateById(
      addressId,
      userId,
      {
        label: addressData.label !== undefined ? addressData.label.trim() : undefined,
        fullName: addressData.fullName !== undefined ? addressData.fullName.trim() : undefined,
        line1: addressData.line1 !== undefined ? addressData.line1.trim() : undefined,
        line2: addressData.line2 !== undefined ? addressData.line2.trim() : undefined,
        city: addressData.city !== undefined ? addressData.city.trim() : undefined,
        state: addressData.state !== undefined ? addressData.state.trim() : undefined,
        postalCode: addressData.postalCode !== undefined ? addressData.postalCode.trim() : undefined,
        country: addressData.country !== undefined ? addressData.country.trim() : undefined,
        phone: addressData.phone !== undefined ? addressData.phone.trim() : undefined,
        isDefault: addressData.isDefault,
      },
      client
    );

    if (!updated) {
      throw new AppError("Address not found", 404);
    }

    return updated;
  };

  if (isDbClient(clientOrPool)) {
    return executeUpdate(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getAddressPool();
  return withTransaction(pool, executeUpdate);
}

/**
 * Deletes an address.
 * If the deleted address was default and other addresses exist, promotes the first one to default.
 */
export async function deleteAddress(
  userId: string,
  addressId: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<void> {
  if (!isValidEntityId(userId) || !isValidEntityId(addressId)) {
    throw new AppError("Invalid user or address id", 400);
  }

  const executeDelete = async (client: IDbClient) => {
    const existing = await getAddressRepo().findByIdAndUserId(addressId, userId, client);
    if (!existing) {
      throw new AppError("Address not found", 404);
    }

    const wasDefault = existing.isDefault;
    await getAddressRepo().deleteById(addressId, userId, client);

    // If deleted address was default and other addresses remain, set first as default
    if (wasDefault) {
      const firstRemaining = await getAddressRepo().findFirstByUserId(userId, client);
      if (firstRemaining) {
        await getAddressRepo().setDefault(firstRemaining.id, userId, client);
      }
    }
  };

  if (isDbClient(clientOrPool)) {
    return executeDelete(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getAddressPool();
  return withTransaction(pool, executeDelete);
}

/**
 * Sets an address as the user's default address.
 */
export async function setDefaultAddress(
  userId: string,
  addressId: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<void> {
  if (!isValidEntityId(userId) || !isValidEntityId(addressId)) {
    throw new AppError("Invalid user or address id", 400);
  }

  const executeSetDefault = async (client: IDbClient) => {
    const existing = await getAddressRepo().findByIdAndUserId(addressId, userId, client);
    if (!existing) {
      throw new AppError("Address not found", 404);
    }

    await getAddressRepo().setDefault(addressId, userId, client);
  };

  if (isDbClient(clientOrPool)) {
    return executeSetDefault(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getAddressPool();
  return withTransaction(pool, executeSetDefault);
}

export const addressService = {
  getUserAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};
