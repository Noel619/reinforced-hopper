package com.reinforcedhopper.item;

import net.minecraft.component.type.TooltipDisplayComponent;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.function.Consumer;

public class LaneUpgradeItem extends Item {
	private final int lanes;
	private final Formatting color;

	public LaneUpgradeItem(Settings settings, int lanes, Formatting color) {
		super(settings);
		this.lanes = lanes;
		this.color = color;
	}

	public int getLanes() {
		return this.lanes;
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, TooltipDisplayComponent displayComponent, Consumer<Text> textConsumer, TooltipType type) {
		textConsumer.accept(Text.translatable(this.getTranslationKey() + ".tooltip").formatted(this.color));
		super.appendTooltip(stack, context, displayComponent, textConsumer, type);
	}
}
