package com.reinforcedhopper.client;

import com.reinforcedhopper.ReinforcedHopperMod;
import com.reinforcedhopper.screen.ReinforcedHopperScreenHandler;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Identifier;

@Environment(EnvType.CLIENT)
public class ReinforcedHopperScreen extends HandledScreen<ReinforcedHopperScreenHandler> {
	private static final Identifier TEXTURE = Identifier.of(ReinforcedHopperMod.MOD_ID, "textures/gui/container/reinforced_hopper.png");

	public ReinforcedHopperScreen(ReinforcedHopperScreenHandler handler, PlayerInventory inventory, Text title) {
		super(handler, inventory, title);
		this.backgroundHeight = 133;
		this.playerInventoryTitleY = this.backgroundHeight - 94;
	}

	@Override
	public void render(DrawContext context, int mouseX, int mouseY, float delta) {
		super.render(context, mouseX, mouseY, delta);
		this.drawMouseoverTooltip(context, mouseX, mouseY);

		int originX = (this.width - this.backgroundWidth) / 2;
		int originY = (this.height - this.backgroundHeight) / 2;

		// Slot 7: Speed Upgrade Slot (Diamond Upgrade)
		int speedSlotX = originX + 137;
		int speedSlotY = originY + 20;
		if (mouseX >= speedSlotX && mouseX < speedSlotX + 16 && mouseY >= speedSlotY && mouseY < speedSlotY + 16) {
			if (this.handler.getSlot(ReinforcedHopperScreenHandler.SPEED_UPGRADE_SLOT_INDEX).getStack().isEmpty()) {
				context.drawTooltip(this.textRenderer, Text.translatable("gui.reinforced_hopper.upgrade_slot").formatted(Formatting.AQUA), mouseX, mouseY);
			}
		}

		// Slot 8: Block Multi-Lane Upgrade Slot (Emerald, Diamond, Netherite Block)
		int blockSlotX = originX + 155;
		int blockSlotY = originY + 20;
		if (mouseX >= blockSlotX && mouseX < blockSlotX + 16 && mouseY >= blockSlotY && mouseY < blockSlotY + 16) {
			if (this.handler.getSlot(ReinforcedHopperScreenHandler.BLOCK_UPGRADE_SLOT_INDEX).getStack().isEmpty()) {
				context.drawTooltip(this.textRenderer, Text.translatable("gui.reinforced_hopper.block_slot").formatted(Formatting.GREEN), mouseX, mouseY);
			}
		}
	}

	@Override
	protected void drawBackground(DrawContext context, float delta, int mouseX, int mouseY) {
		int i = (this.width - this.backgroundWidth) / 2;
		int j = (this.height - this.backgroundHeight) / 2;
		context.drawTexture(RenderPipelines.GUI_TEXTURED, TEXTURE, i, j, 0.0F, 0.0F, this.backgroundWidth, this.backgroundHeight, 256, 256);
	}
}
