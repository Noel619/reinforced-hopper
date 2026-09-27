package com.reinforcedhopper;

import com.reinforcedhopper.block.ModBlocks;
import com.reinforcedhopper.config.ModConfig;
import com.reinforcedhopper.item.ModItems;
import com.reinforcedhopper.screen.ModScreenHandlers;
import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ReinforcedHopperMod implements ModInitializer {
	public static final String MOD_ID = "reinforced_hopper";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		LOGGER.info("Reinforced Hopper initializing...");
		ModConfig.INSTANCE = ModConfig.loadConfig();
		ModItems.initialize();
		ModBlocks.initialize();
		ModScreenHandlers.initialize();
		LOGGER.info("Reinforced Hopper initialized successfully!");
	}
}
