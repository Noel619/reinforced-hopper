package com.reinforcedhopper.screen;

import com.reinforcedhopper.item.ModItems;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.inventory.Inventory;
import net.minecraft.inventory.SimpleInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;

public class ReinforcedHopperScreenHandler extends ScreenHandler {
	public static final int REGULAR_SLOTS = 7;
	public static final int SPEED_UPGRADE_SLOT_INDEX = 7;
	public static final int BLOCK_UPGRADE_SLOT_INDEX = 8;
	public static final int TOTAL_SLOTS = 9;
	private final Inventory inventory;

	public ReinforcedHopperScreenHandler(int syncId, PlayerInventory playerInventory) {
		this(syncId, playerInventory, new SimpleInventory(TOTAL_SLOTS));
	}

	public ReinforcedHopperScreenHandler(int syncId, PlayerInventory playerInventory, Inventory inventory) {
		super(ModScreenHandlers.REINFORCED_HOPPER, syncId);
		this.inventory = inventory;
		checkSize(inventory, TOTAL_SLOTS);
		inventory.onOpen(playerInventory.player);

		// 7 regular hopper storage slots
		for (int i = 0; i < REGULAR_SLOTS; i++) {
			this.addSlot(new Slot(inventory, i, 9 + i * 18, 20));
		}

		// Slot 7: Dedicated Diamond Speed Upgrade slot
		this.addSlot(new ReinforcedHopperUpgradeSlot(inventory, SPEED_UPGRADE_SLOT_INDEX, 137, 20));

		// Slot 8: Dedicated Block Multi-Lane Upgrade slot (Emerald, Diamond, Netherite Block)
		this.addSlot(new ReinforcedHopperBlockUpgradeSlot(inventory, BLOCK_UPGRADE_SLOT_INDEX, 155, 20));

		// Player inventory and hotbar
		this.addPlayerSlots(playerInventory, 8, 51);
	}

	@Override
	public boolean canUse(PlayerEntity player) {
		return this.inventory.canPlayerUse(player);
	}

	@Override
	public ItemStack quickMove(PlayerEntity player, int slotIndex) {
		ItemStack itemStack = ItemStack.EMPTY;
		Slot slot = this.slots.get(slotIndex);
		if (slot.hasStack()) {
			ItemStack itemStack2 = slot.getStack();
			itemStack = itemStack2.copy();

			if (slotIndex < TOTAL_SLOTS) {
				// From hopper to player inventory
				if (!this.insertItem(itemStack2, TOTAL_SLOTS, this.slots.size(), true)) {
					return ItemStack.EMPTY;
				}
			} else {
				// From player inventory to hopper
				if (itemStack2.isOf(ModItems.DIAMOND_UPGRADE)) {
					// Try placing into speed upgrade slot first
					if (!this.insertItem(itemStack2, SPEED_UPGRADE_SLOT_INDEX, SPEED_UPGRADE_SLOT_INDEX + 1, false)) {
						if (!this.insertItem(itemStack2, 0, REGULAR_SLOTS, false)) {
							return ItemStack.EMPTY;
						}
					}
				} else if (ReinforcedHopperBlockUpgradeSlot.isValidBlockUpgrade(itemStack2)) {
					// Try placing into block upgrade slot first
					if (!this.insertItem(itemStack2, BLOCK_UPGRADE_SLOT_INDEX, BLOCK_UPGRADE_SLOT_INDEX + 1, false)) {
						if (!this.insertItem(itemStack2, 0, REGULAR_SLOTS, false)) {
							return ItemStack.EMPTY;
						}
					}
				} else {
					// Place into regular slots
					if (!this.insertItem(itemStack2, 0, REGULAR_SLOTS, false)) {
						return ItemStack.EMPTY;
					}
				}
			}

			if (itemStack2.isEmpty()) {
				slot.setStack(ItemStack.EMPTY);
			} else {
				slot.markDirty();
			}
		}

		return itemStack;
	}

	@Override
	public void onClosed(PlayerEntity player) {
		super.onClosed(player);
		this.inventory.onClose(player);
	}
}
