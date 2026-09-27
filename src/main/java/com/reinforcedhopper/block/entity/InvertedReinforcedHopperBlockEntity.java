package com.reinforcedhopper.block.entity;

import com.reinforcedhopper.block.InvertedReinforcedHopperBlock;
import com.reinforcedhopper.block.ModBlocks;
import net.minecraft.block.BlockState;
import net.minecraft.entity.ItemEntity;
import net.minecraft.inventory.Inventory;
import net.minecraft.predicate.entity.EntityPredicates;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Direction;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

import java.util.List;

public class InvertedReinforcedHopperBlockEntity extends ReinforcedHopperBlockEntity {
	public InvertedReinforcedHopperBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlocks.INVERTED_REINFORCED_HOPPER_BLOCK_ENTITY, pos, state);
	}

	@Override
	public Direction getFacing() {
		BlockState state = this.getCachedState();
		if (state.contains(InvertedReinforcedHopperBlock.FACING)) {
			return state.get(InvertedReinforcedHopperBlock.FACING);
		}
		return Direction.UP;
	}

	@Override
	public Direction getInputDirection() {
		return Direction.UP;
	}

	@Override
	@Nullable
	public Inventory getInputInventory(World world) {
		BlockPos blockPos = BlockPos.ofFloored(this.getHopperX(), this.getHopperY() - 1.0, this.getHopperZ());
		BlockState blockState = world.getBlockState(blockPos);
		return getInventoryAt(world, blockPos, blockState, this.getHopperX(), this.getHopperY() - 1.0, this.getHopperZ());
	}

	@Override
	public List<ItemEntity> getItemEntitiesToSuck(World world) {
		Box box = new Box(
				this.getHopperX() - 0.5, this.getHopperY() - 1.0, this.getHopperZ() - 0.5,
				this.getHopperX() + 0.5, this.getHopperY(), this.getHopperZ() + 0.5
		);
		return world.getEntitiesByClass(ItemEntity.class, box, EntityPredicates.VALID_ENTITY);
	}

	@Override
	protected Text getContainerName() {
		return Text.translatable("container.inverted_reinforced_hopper");
	}
}
