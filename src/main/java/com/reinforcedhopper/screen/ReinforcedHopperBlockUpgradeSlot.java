package com.reinforcedhopper.screen;

import com.reinforcedhopper.item.LaneUpgradeItem;
import com.reinforcedhopper.item.ModItems;
import net.minecraft.inventory.Inventory;
import net.minecraft.item.ItemStack;
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
		return stack.getItem() instanceof LaneUpgradeItem
				|| stack.isOf(ModItems.EMERALD_LANE_UPGRADE)
				|| stack.isOf(ModItems.DIAMOND_LANE_UPGRADE)
				|| stack.isOf(ModItems.NETHERITE_LANE_UPGRADE);
	}

	@Override
	public int getMaxItemCount() {
		return 1;
	}
}
