package com.reinforcedhopper.client;

import com.reinforcedhopper.screen.ModScreenHandlers;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.gui.screen.ingame.HandledScreens;

public class ReinforcedHopperClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		HandledScreens.register(ModScreenHandlers.REINFORCED_HOPPER, ReinforcedHopperScreen::new);
	}
}
