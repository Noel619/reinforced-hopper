package com.reinforcedhopper.block;

import com.reinforcedhopper.ReinforcedHopperMod;
import com.reinforcedhopper.block.entity.InvertedReinforcedHopperBlockEntity;
import com.reinforcedhopper.block.entity.ReinforcedHopperBlockEntity;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.MapColor;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.block.entity.BlockEntityType;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.sound.BlockSoundGroup;
import net.minecraft.util.Identifier;

import java.util.function.Function;

public class ModBlocks {
	public static final Block REINFORCED_HOPPER = register(
			"reinforced_hopper",
			ReinforcedHopperBlock::new,
			AbstractBlock.Settings.create()
					.mapColor(MapColor.IRON_GRAY)
					.requiresTool()
					.strength(4.0F, 6.0F)
					.sounds(BlockSoundGroup.METAL)
					.nonOpaque(),
			true
	);

	public static final Block INVERTED_REINFORCED_HOPPER = register(
			"inverted_reinforced_hopper",
			InvertedReinforcedHopperBlock::new,
			AbstractBlock.Settings.create()
					.mapColor(MapColor.IRON_GRAY)
					.requiresTool()
					.strength(4.0F, 6.0F)
					.sounds(BlockSoundGroup.METAL)
					.nonOpaque(),
			true
	);

	private static Block register(String name, Function<AbstractBlock.Settings, Block> blockFactory, AbstractBlock.Settings settings, boolean shouldRegisterItem) {
		RegistryKey<Block> blockKey = keyOfBlock(name);
		Block block = blockFactory.apply(settings.registryKey(blockKey));

		if (shouldRegisterItem) {
			RegistryKey<Item> itemKey = keyOfItem(name);
			BlockItem blockItem = new BlockItem(block, new Item.Settings().registryKey(itemKey));
			Registry.register(Registries.ITEM, itemKey, blockItem);
		}

		return Registry.register(Registries.BLOCK, blockKey, block);
	}

	private static RegistryKey<Block> keyOfBlock(String name) {
		return RegistryKey.of(RegistryKeys.BLOCK, Identifier.of(ReinforcedHopperMod.MOD_ID, name));
	}

	private static RegistryKey<Item> keyOfItem(String name) {
		return RegistryKey.of(RegistryKeys.ITEM, Identifier.of(ReinforcedHopperMod.MOD_ID, name));
	}

	public static final BlockEntityType<ReinforcedHopperBlockEntity> REINFORCED_HOPPER_BLOCK_ENTITY =
			register("reinforced_hopper", ReinforcedHopperBlockEntity::new, ModBlocks.REINFORCED_HOPPER);

	public static final BlockEntityType<InvertedReinforcedHopperBlockEntity> INVERTED_REINFORCED_HOPPER_BLOCK_ENTITY =
			register("inverted_reinforced_hopper", InvertedReinforcedHopperBlockEntity::new, ModBlocks.INVERTED_REINFORCED_HOPPER);

	private static <T extends BlockEntity> BlockEntityType<T> register(
			String name,
			FabricBlockEntityTypeBuilder.Factory<? extends T> entityFactory,
			Block... blocks
	) {
		Identifier id = Identifier.of(ReinforcedHopperMod.MOD_ID, name);
		return Registry.register(Registries.BLOCK_ENTITY_TYPE, id, FabricBlockEntityTypeBuilder.<T>create(entityFactory, blocks).build());
	}

	public static void initialize() {
	}
}
