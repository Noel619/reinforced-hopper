package com.reinforcedhopper.screen;

import net.minecraft.inventory.Inventory;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.screen.slot.Slot;

public class ReinforcedHopperBlockUpgradeSlot extends Slot {
	public ReinforcedHopperBlockUpgradeSlot(Inventory inventory, int index, int x, int y) {
		super(inventory, index, x, y);
	}

	@Override
	public boolean canInsert(ItemStack stack) {
		return isValidBlockUpgrade(stack);
	}

	public static boolean isValidBlockUpgrade(ItemStack stack) {
		return stack.isOf(Items.EMERALD_BLOCK) || stack.isOf(Items.DIAMOND_BLOCK) || stack.isOf(Items.NETHERITE_BLOCK);
	}

	@Override
	public int getMaxItemCount() {
		return 1;
	}
}
