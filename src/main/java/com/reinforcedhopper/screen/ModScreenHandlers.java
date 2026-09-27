package com.reinforcedhopper.screen;

import com.reinforcedhopper.ReinforcedHopperMod;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.resource.featuretoggle.FeatureFlags;
import net.minecraft.screen.ScreenHandlerType;

public class ModScreenHandlers {
	public static final ScreenHandlerType<ReinforcedHopperScreenHandler> REINFORCED_HOPPER = Registry.register(
			Registries.SCREEN_HANDLER,
			ReinforcedHopperMod.MOD_ID + ":reinforced_hopper",
			new ScreenHandlerType<>(ReinforcedHopperScreenHandler::new, FeatureFlags.VANILLA_FEATURES)
	);

	public static void initialize() {
	}
}
