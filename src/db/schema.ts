import {
  text,
  timestamp,
  boolean,
  pgSchema,
  uuid,
  bigint,
  varchar,
  serial,
  integer,
} from "drizzle-orm/pg-core";

const exp2Schema = pgSchema("exp_2");

//Auth
export const user = exp2Schema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = exp2Schema.table("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = exp2Schema.table("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = exp2Schema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

//app

export const poll = exp2Schema.table("poll", {
  id: uuid("id").defaultRandom().primaryKey(),
  question: text("question").notNull(),
  extraInfo: text("extra_info"),
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

export const pollOption = exp2Schema.table("poll_option", {
  id: uuid("id").defaultRandom().primaryKey(),
  pollId: uuid("poll_id").references(() => poll.id),
  optionKey: varchar("option_key", { length: 2 }).notNull(),
  text: text("text").notNull(),
  confidence: text("confidence").notNull(),
  count: integer("count").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

export const pollVote = exp2Schema.table("poll_vote", {
  id: uuid("id").defaultRandom().primaryKey(),
  pollId: uuid("poll_id")
    .references(() => poll.id)
    .notNull(),
  optionId: uuid("option_id")
    .references(() => pollOption.id)
    .notNull(), // Also making optionId non-nullable for consistency
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

export const pollTag = exp2Schema.table("poll_tag", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name").notNull(),
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

export const pollTagMap = exp2Schema.table("poll_tag_map", {
  id: uuid("id").defaultRandom().primaryKey(),
  pollId: uuid("poll_id").references(() => poll.id),
  tagId: uuid("tag_id").references(() => pollTag.id),
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(), // Added updatedAt
  isDeleted: boolean("is_deleted").notNull().default(false),
});
