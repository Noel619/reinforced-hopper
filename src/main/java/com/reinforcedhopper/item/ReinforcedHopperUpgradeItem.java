package com.reinforcedhopper.item;

import net.minecraft.component.type.TooltipDisplayComponent;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.function.Consumer;

public class ReinforcedHopperUpgradeItem extends Item {
	public ReinforcedHopperUpgradeItem(Settings settings) {
		super(settings);
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, TooltipDisplayComponent displayComponent, Consumer<Text> textConsumer, TooltipType type) {
		textConsumer.accept(Text.translatable("item.reinforced_hopper.diamond_upgrade.tooltip").formatted(Formatting.AQUA));
		super.appendTooltip(stack, context, displayComponent, textConsumer, type);
	}
}
