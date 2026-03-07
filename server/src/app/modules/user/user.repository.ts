import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { Database } from '../../../database/schema';
import { users } from './schemas/users';
import { type User, UserShort } from './schemas/users';
import { cities } from '../city/schemas/cities';
import { countries } from '../country/schemas/countries';
import { SqlQueryResult } from '../../../database/utils';
import { CityRepository } from '../city/city.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { HrefService } from '../../services/href/href.service';

export interface UserRow {
  tgId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  subscribedToNewsletter: boolean;
  isActive: boolean;
  isBanned: boolean;
  city_id: string | null;
  city_name: string | null;
  city_isActive: boolean | null;
  country_id: string | null;
  country_name: string | null;
  country_isActive: boolean | null;
  emailVerified: boolean | null;
  emailVerificationCode: string | null;
  resetPasswordCode: string | null;
  passwordHash: string | null;
  role: string | null;
}

export interface UserShortRow {
  tgId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  bannerUrl?: string | null;
  email: string | null;
  phone: string | null;
  role?: string | null;
  city_id: string | null;
  city_name: string | null;
  country_id: string | null;
  country_name: string | null;
}

@Injectable()
export class UserRepository {
  constructor(
    @Inject('DATABASE') private readonly db: Database,
    private readonly cityRepository: CityRepository,
    @Inject(forwardRef(() => HrefService))
    private readonly hrefService: HrefService
  ) {}

  mapToUser(row: UserRow): User {
    const city = row.city_id
      ? this.cityRepository.mapToCity({
          id: row.city_id,
          name: row.city_name!,
          isActive: row.city_isActive!,
          country_id: row.country_id,
          country_name: row.country_name!,
          country_isActive: row.country_isActive!
        })
      : null;

    return {
      tgId: row.tgId,
      username: row.username,
      firstName: row.firstName,
      lastName: row.lastName,
      photoUrl: row.photoUrl,
      email: row.email,
      phone: row.phone,
      subscribedToNewsletter: row.subscribedToNewsletter,
      isActive: row.isActive,
      isBanned: row.isBanned,
      city,
      emailVerified: row.emailVerified ?? false,
      emailVerificationCode: row.emailVerificationCode ?? null,
      resetPasswordCode: row.resetPasswordCode ?? null,
      passwordHash: row.passwordHash ?? null,
      role: (row.role as any) ?? 'user'
    };
  }

  mapToUserShort(row: UserShortRow): UserShort {
    const city = row.city_id
      ? this.cityRepository.mapToCityShort({
          id: row.city_id,
          name: row.city_name!,
          country_id: row.country_id,
          country_name: row.country_name!
        })
      : null;

    return {
      tgId: row.tgId,
      username: row.username,
      firstName: row.firstName,
      lastName: row.lastName,
      photoUrl: row.photoUrl,
      bannerUrl: row.bannerUrl ?? null,
      email: row.email,
      phone: row.phone,
      role: (row.role as any) ?? 'user',
      city
    };
  }

  async findAll(): Promise<User[]> {
    const result = (await this.db.execute(sql`
            SELECT
                user.tgId,
                user.username,
                user.firstName,
                user.lastName,
                user.photoUrl,
                user.email,
                user.phone,
                user.subscribedToNewsletter,
                user.isActive,
                user.isBanned,
                user.role,
                city.id as city_id,
                city.name as city_name,
                city.isActive as city_isActive,
                country.id as country_id,
                country.name as country_name,
                country.isActive as country_isActive
            FROM ${users} user
            LEFT JOIN ${cities} city ON user.cityId = city.id
            LEFT JOIN ${countries} country ON city.countryId = country.id
            ORDER BY user.createdAt DESC
        `)) as SqlQueryResult<UserRow>;

    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }

    return result[0].map(row => this.mapToUser(row));
  }

  async findById(tgId: string): Promise<User | null> {
    const result = (await this.db.execute(sql`
            SELECT
                user.tgId,
                user.username,
                user.firstName,
                user.lastName,
                user.photoUrl,
                user.email,
                user.isBanned,
                user.phone,
                user.subscribedToNewsletter,
                user.isActive,
                user.emailVerified,
                user.role,
                city.id as city_id,
                city.name as city_name,
                city.isActive as city_isActive,
                country.id as country_id,
                country.name as country_name,
                country.isActive as country_isActive
            FROM ${users} user
            LEFT JOIN ${cities} city ON user.cityId = city.id
            LEFT JOIN ${countries} country ON city.countryId = country.id
            WHERE user.tgId = ${tgId}
        `)) as SqlQueryResult<UserRow>;

    if (!Array.isArray(result[0]) || !result[0][0]) return null;

    const user = this.mapToUser(result[0][0]);
    const url = await this.hrefService.generateReferralLink();
    return { ...user, url };
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = (await this.db.execute(sql`
                SELECT
                    user.tgId,
                    user.username,
                    user.firstName,
                    user.lastName,
                    user.photoUrl,
                    user.email,
                    user.phone,
                    user.subscribedToNewsletter,
                    user.isActive,
                    user.isBanned,
                    user.emailVerified,
                    user.emailVerificationCode,
                    user.resetPasswordCode,
                    user.passwordHash,
                    user.role,
                    city.id as city_id,
                    city.name as city_name,
                    city.isActive as city_isActive,
                    country.id as country_id,
                    country.name as country_name,
                    country.isActive as country_isActive
                FROM ${users} user
                LEFT JOIN ${cities} city ON user.cityId = city.id
                LEFT JOIN ${countries} country ON city.countryId = country.id
                WHERE user.email = ${email}
            `)) as SqlQueryResult<UserRow>;

    if (!Array.isArray(result[0]) || !result[0][0]) return null;

    return this.mapToUser(result[0][0]);
  }

  async findByShortHash(shortHash: string): Promise<User | null> {
    const result = (await this.db.execute(sql`
                SELECT
                    user.tgId,
                    user.username,
                    user.firstName,
                    user.lastName,
                    user.photoUrl,
                    user.email,
                    user.phone,
                    user.subscribedToNewsletter,
                    user.isActive,
                    user.isBanned,
                    user.emailVerified,
                    user.emailVerificationCode,
                    user.resetPasswordCode,
                    user.passwordHash,
                    user.role,
                    city.id as city_id,
                    city.name as city_name,
                    city.isActive as city_isActive,
                    country.id as country_id,
                    country.name as country_name,
                    country.isActive as country_isActive
                FROM ${users} user
                LEFT JOIN ${cities} city ON user.cityId = city.id
                LEFT JOIN ${countries} country ON city.countryId = country.id
                WHERE user.tgId LIKE 'email:%'
            `)) as SqlQueryResult<UserRow>;

    if (!Array.isArray(result[0])) return null;

    const crypto = require('crypto');
    for (const row of result[0]) {
      if (row.tgId.startsWith('email:')) {
        const uuid = row.tgId.replace('email:', '');
        const hash = crypto.createHash('sha256').update(uuid).digest('hex');
        if (hash.substring(0, 12) === shortHash) {
          return this.mapToUser(row);
        }
      }
    }

    return null;
  }

  async findShortById(tgId: string): Promise<UserShort | null> {
    const result = (await this.db.execute(sql`
            SELECT
                user.tgId,
                user.username,
                user.firstName,
                user.lastName,
                user.photoUrl,
                user.bannerUrl,
                user.email,
                user.phone,
                user.role,
                city.id as city_id,
                city.name as city_name,
                country.id as country_id,
                country.name as country_name
            FROM ${users} user
            LEFT JOIN ${cities} city ON user.cityId = city.id
            LEFT JOIN ${countries} country ON city.countryId = country.id
            WHERE user.tgId = ${tgId}
        `)) as SqlQueryResult<UserShortRow>;

    if (!Array.isArray(result[0]) || !result[0][0]) return null;
    const data = this.mapToUserShort(result[0][0]);
    const url = await this.hrefService.generateShareLink(data.tgId, 'seller');
    return { ...data, url };
  }

  async create(dto: CreateUserDto): Promise<User> {
    await this.db.insert(users).values(dto);

    const user = await this.findById(dto.tgId);

    if (!user) {
      throw new Error('User not created');
    }

    return user;
  }

  async update(tgId: string, dto: UpdateUserDto): Promise<boolean> {
    await this.db.update(users).set(dto).where(eq(users.tgId, tgId));
    return true;
  }

  async delete(tgId: string): Promise<boolean> {
    await this.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.tgId, tgId));
    return true;
  }

  async getIdsForBroadcastBatch(
    offset: number,
    limit: number,
    userIds?: string[]
  ): Promise<string[]> {
    let query = sql`
            SELECT tgId
            FROM ${users}
            WHERE isActive = true AND subscribedToNewsletter = true AND isBanned = false
        `;

    if (userIds && userIds.length > 0) {
      query = sql`
                ${query}
                AND tgId IN (${sql.join(userIds, sql`, `)})
            `;
    }

    query = sql`
            ${query}
            ORDER BY tgId ASC
            LIMIT ${limit}
            OFFSET ${offset}
        `;

    const result = (await this.db.execute(query)) as SqlQueryResult<{
      tgId: string;
    }>;
    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }
    return result[0].map(row => row.tgId);
  }

  async getStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    usersByLangCode: Record<string, number>;
  }> {
    const [
      totalUsersResult,
      activeUsersResult,
      inactiveUsersResult,
      langCodeStatsResult
    ] = await Promise.all([
      this.db.execute(sql`SELECT COUNT(*) as count FROM ${users}`),
      this.db.execute(
        sql`SELECT COUNT(*) as count FROM ${users} WHERE isActive = true`
      ),
      this.db.execute(
        sql`SELECT COUNT(*) as count FROM ${users} WHERE isActive = false`
      ),
      this.db.execute(sql`
                SELECT langCode, COUNT(*) as count
                FROM ${users}
                WHERE langCode IS NOT NULL
                GROUP BY langCode
            `)
    ]);

    const totalUsers = totalUsersResult as SqlQueryResult<{ count: number }>;
    const activeUsers = activeUsersResult as SqlQueryResult<{ count: number }>;
    const inactiveUsers = inactiveUsersResult as SqlQueryResult<{
      count: number;
    }>;
    const langCodeStats = langCodeStatsResult as SqlQueryResult<{
      langCode: string;
      count: number;
    }>;

    if (
      !Array.isArray(totalUsers[0]) ||
      !Array.isArray(activeUsers[0]) ||
      !Array.isArray(inactiveUsers[0]) ||
      !Array.isArray(langCodeStats[0])
    ) {
      throw new Error('Unexpected query result format');
    }

    const usersByLangCode: Record<string, number> = {};
    langCodeStats[0].forEach(row => {
      if (row.langCode) {
        usersByLangCode[row.langCode] = parseInt(row.count.toString());
      }
    });

    return {
      totalUsers: totalUsers[0][0]?.count || 0,
      activeUsers: activeUsers[0][0]?.count || 0,
      inactiveUsers: inactiveUsers[0][0]?.count || 0,
      usersByLangCode
    };
  }

  async mergeAccounts(telegramUser: User, emailUser: User): Promise<User> {
    if (telegramUser.tgId === emailUser.tgId) {
      return telegramUser;
    }

    const telegramId = telegramUser.tgId;
    const webId = emailUser.tgId;

    const createdResult = (await this.db.execute(sql`
      SELECT tgId, createdAt
      FROM ${users}
      WHERE tgId IN (${telegramId}, ${webId})
    `)) as SqlQueryResult<{ tgId: string; createdAt: Date }>;

    let olderRow: { tgId: string; createdAt: Date };

    if (!Array.isArray(createdResult[0]) || createdResult[0].length < 2) {
      const foundRows = Array.isArray(createdResult[0]) ? createdResult[0] : [];

      if (foundRows.length === 1) {
        olderRow = foundRows[0];
      } else {
        const telegramRow = foundRows.find(r => r.tgId === telegramId);
        const emailRow = foundRows.find(r => r.tgId === webId);

        if (telegramRow && emailRow) {
          olderRow =
            telegramRow.createdAt <= emailRow.createdAt
              ? telegramRow
              : emailRow;
        } else if (telegramRow) {
          olderRow = telegramRow;
        } else if (emailRow) {
          olderRow = emailRow;
        } else {
          olderRow = { tgId: telegramId, createdAt: new Date() };
        }
      }
    } else {
      const [row1, row2] = createdResult[0];
      olderRow = row1.createdAt <= row2.createdAt ? row1 : row2;
    }

    const primary = olderRow.tgId === telegramId ? telegramUser : emailUser;
    const secondary = olderRow.tgId === telegramId ? emailUser : telegramUser;

    const getValue = <T>(
      primaryValue: T | null | undefined,
      secondaryValue: T | null | undefined
    ): T | null => {
      if (
        primaryValue !== null &&
        primaryValue !== undefined &&
        primaryValue !== ''
      ) {
        return primaryValue;
      }
      if (
        secondaryValue !== null &&
        secondaryValue !== undefined &&
        secondaryValue !== ''
      ) {
        return secondaryValue;
      }
      return null;
    };

    const merged: UpdateUserDto = {
      username: getValue(primary.username, secondary.username),
      firstName: getValue(primary.firstName, secondary.firstName),
      lastName: getValue(primary.lastName, secondary.lastName),
      photoUrl: getValue(primary.photoUrl, secondary.photoUrl),
      email: getValue(primary.email, secondary.email),
      phone: getValue(primary.phone, secondary.phone),
      cityId: primary.city?.id ?? secondary.city?.id ?? null,
      subscribedToNewsletter:
        primary.subscribedToNewsletter ?? secondary.subscribedToNewsletter,
      emailVerified: primary.emailVerified || secondary.emailVerified,
      passwordHash: getValue(primary.passwordHash, secondary.passwordHash),
      emailVerificationCode: null,
      resetPasswordCode: null
    };

    await this.update(telegramId, merged);

    await this.db.execute(sql`
      UPDATE Products
      SET userId = ${telegramId}
      WHERE userId = ${webId}
    `);

    const favoritesResult = (await this.db.execute(sql`
      SELECT productId, isActive
      FROM FavoriteProducts
      WHERE userId = ${webId}
    `)) as SqlQueryResult<{ productId: string; isActive: boolean }>;

    if (Array.isArray(favoritesResult[0])) {
      for (const row of favoritesResult[0]) {
        await this.db.execute(sql`
          INSERT INTO FavoriteProducts (userId, productId, isActive)
          VALUES (${telegramId}, ${row.productId}, ${row.isActive})
          ON DUPLICATE KEY UPDATE isActive = VALUES(isActive)
        `);
      }
      await this.db.execute(sql`
        DELETE FROM FavoriteProducts
        WHERE userId = ${webId}
      `);
    }

    await this.db.execute(sql`
      UPDATE Resumes
      SET userId = ${telegramId}
      WHERE userId = ${webId}
    `);

    await this.db.execute(sql`
      UPDATE Vacancies
      SET userId = ${telegramId}
      WHERE userId = ${webId}
    `);

    await this.db.execute(sql`
      UPDATE ViewedProducts
      SET userId = ${telegramId}
      WHERE userId = ${webId}
    `);

    await this.db.execute(sql`
      UPDATE RefreshTokens
      SET userId = ${telegramId}
      WHERE userId = ${webId}
    `);

    await this.db.execute(sql`
      DELETE FROM Users
      WHERE tgId = ${webId}
    `);

    const mergedUser = await this.findById(telegramId);
    if (!mergedUser) {
      throw new Error('Merged user not found');
    }

    return mergedUser;
  }

  async transferUserData(oldTgId: string, newTgId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE Products
      SET userId = ${newTgId}
      WHERE userId = ${oldTgId}
    `);

    const favoritesResult = (await this.db.execute(sql`
      SELECT productId, isActive
      FROM FavoriteProducts
      WHERE userId = ${oldTgId}
    `)) as SqlQueryResult<{ productId: string; isActive: boolean }>;

    if (Array.isArray(favoritesResult[0])) {
      for (const row of favoritesResult[0]) {
        await this.db.execute(sql`
          INSERT INTO FavoriteProducts (userId, productId, isActive)
          VALUES (${newTgId}, ${row.productId}, ${row.isActive})
          ON DUPLICATE KEY UPDATE isActive = VALUES(isActive)
        `);
      }
      await this.db.execute(sql`
        DELETE FROM FavoriteProducts
        WHERE userId = ${oldTgId}
      `);
    }

    await this.db.execute(sql`
      UPDATE Resumes
      SET userId = ${newTgId}
      WHERE userId = ${oldTgId}
    `);

    await this.db.execute(sql`
      UPDATE Vacancies
      SET userId = ${newTgId}
      WHERE userId = ${oldTgId}
    `);

    await this.db.execute(sql`
      UPDATE ViewedProducts
      SET userId = ${newTgId}
      WHERE userId = ${oldTgId}
    `);

    await this.db.execute(sql`
      UPDATE RefreshTokens
      SET userId = ${newTgId}
      WHERE userId = ${oldTgId}
    `);

    await this.db.execute(sql`
      DELETE FROM Users
      WHERE tgId = ${oldTgId}
    `);
  }
}
