package com.reinforcedhopper.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;
import com.reinforcedhopper.ReinforcedHopperMod;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class ModConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path CONFIG_PATH = Path.of("config", "reinforced_hopper.json");

	// Vanilla hopper is 8 ticks.
	// Base reinforced hopper is 3 ticks (~2.67x speed, 2.5x requested).
	// Upgraded with diamond is 1 tick (3x faster than base reinforced hopper, 20 items/sec).
	public int baseCooldownTicks = 3;
	public int upgradedCooldownTicks = 1;

	public static ModConfig INSTANCE = new ModConfig();

	public static ModConfig loadConfig() {
		if (!Files.exists(CONFIG_PATH)) {
			ModConfig defaultConfig = new ModConfig();
			defaultConfig.saveConfig();
			return defaultConfig;
		}

		try (Reader reader = Files.newBufferedReader(CONFIG_PATH)) {
			ModConfig config = GSON.fromJson(reader, ModConfig.class);
			return config != null ? config : new ModConfig();
		} catch (IOException | JsonSyntaxException exception) {
			ReinforcedHopperMod.LOGGER.error("Failed to load reinforced_hopper config: {}", exception.getMessage());
			return new ModConfig();
		}
	}

	public void saveConfig() {
		try {
			if (CONFIG_PATH.getParent() != null) {
				Files.createDirectories(CONFIG_PATH.getParent());
			}
			try (Writer writer = Files.newBufferedWriter(CONFIG_PATH, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
				GSON.toJson(this, writer);
			}
		} catch (IOException exception) {
			ReinforcedHopperMod.LOGGER.error("Failed to save reinforced_hopper config: {}", exception.getMessage());
		}
	}
}
