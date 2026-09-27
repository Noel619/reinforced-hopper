package com.reinforcedhopper.screen;

import com.reinforcedhopper.item.ModItems;
import net.minecraft.inventory.Inventory;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.slot.Slot;

public class ReinforcedHopperUpgradeSlot extends Slot {
	public ReinforcedHopperUpgradeSlot(Inventory inventory, int index, int x, int y) {
		super(inventory, index, x, y);
	}

	@Override
	public boolean canInsert(ItemStack stack) {
		return stack.isOf(ModItems.DIAMOND_UPGRADE);
	}

	@Override
	public int getMaxItemCount() {
		return 1;
	}
}
