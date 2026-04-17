import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const musicPlaylistTable = pgTable("music_playlist", {
  id: serial("id").primaryKey(),
  videoId: text("video_id").notNull().unique(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  duration: text("duration").notNull(),
  thumbnail: text("thumbnail"),
  addedBy: text("added_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const musicFavoritesTable = pgTable("music_favorites", {
  videoId: text("video_id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  duration: text("duration").notNull(),
  thumbnail: text("thumbnail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const musicPlayerStateTable = pgTable("music_player_state", {
  id: integer("id").primaryKey(),
  currentVideoId: text("current_video_id"),
  isPlaying: boolean("is_playing").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
