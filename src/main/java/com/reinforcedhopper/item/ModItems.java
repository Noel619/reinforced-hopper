package com.reinforcedhopper.item;

import com.reinforcedhopper.ReinforcedHopperMod;
import com.reinforcedhopper.block.ModBlocks;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.item.Item;
import net.minecraft.item.ItemGroup;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Identifier;

import java.util.function.Function;

public class ModItems {
	public static final RegistryKey<ItemGroup> MOD_ITEM_GROUP_KEY = RegistryKey.of(Registries.ITEM_GROUP.getKey(), Identifier.of(ReinforcedHopperMod.MOD_ID, "item_group"));
	public static final ItemGroup MOD_ITEM_GROUP = FabricItemGroup.builder()
			.icon(() -> new ItemStack(ModBlocks.REINFORCED_HOPPER))
			.displayName(Text.translatable("itemGroup.reinforced_hopper"))
			.build();

	public static final Item DIAMOND_UPGRADE = register("diamond_upgrade", ReinforcedHopperUpgradeItem::new, new Item.Settings().maxCount(16));
	public static final Item EMERALD_LANE_UPGRADE = register("emerald_lane_upgrade", settings -> new LaneUpgradeItem(settings, 2, Formatting.GREEN), new Item.Settings().maxCount(16));
	public static final Item DIAMOND_LANE_UPGRADE = register("diamond_lane_upgrade", settings -> new LaneUpgradeItem(settings, 3, Formatting.AQUA), new Item.Settings().maxCount(16));
	public static final Item NETHERITE_LANE_UPGRADE = register("netherite_lane_upgrade", settings -> new LaneUpgradeItem(settings, 4, Formatting.DARK_PURPLE), new Item.Settings().maxCount(16));

	public static Item register(String name, Function<Item.Settings, Item> itemFactory, Item.Settings settings) {
		RegistryKey<Item> itemKey = RegistryKey.of(RegistryKeys.ITEM, Identifier.of(ReinforcedHopperMod.MOD_ID, name));
		Item item = itemFactory.apply(settings.registryKey(itemKey));
		return Registry.register(Registries.ITEM, itemKey, item);
	}

	public static void initialize() {
		Registry.register(Registries.ITEM_GROUP, MOD_ITEM_GROUP_KEY, MOD_ITEM_GROUP);
		ItemGroupEvents.modifyEntriesEvent(MOD_ITEM_GROUP_KEY).register((group) -> {
			group.add(ModBlocks.REINFORCED_HOPPER.asItem());
			group.add(ModBlocks.INVERTED_REINFORCED_HOPPER.asItem());
			group.add(DIAMOND_UPGRADE);
			group.add(EMERALD_LANE_UPGRADE);
			group.add(DIAMOND_LANE_UPGRADE);
			group.add(NETHERITE_LANE_UPGRADE);
		});
	}
}
