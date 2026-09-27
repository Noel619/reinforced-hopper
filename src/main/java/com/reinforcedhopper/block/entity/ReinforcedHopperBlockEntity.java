package com.reinforcedhopper.block.entity;

import com.reinforcedhopper.block.ModBlocks;
import com.reinforcedhopper.block.ReinforcedHopperBlock;
import com.reinforcedhopper.config.ModConfig;
import com.reinforcedhopper.item.ModItems;
import com.reinforcedhopper.screen.ReinforcedHopperBlockUpgradeSlot;
import com.reinforcedhopper.screen.ReinforcedHopperScreenHandler;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.ChestBlock;
import net.minecraft.block.InventoryProvider;
import net.minecraft.block.entity.BlockEntityType;
import net.minecraft.block.entity.ChestBlockEntity;
import net.minecraft.block.entity.Hopper;
import net.minecraft.block.entity.LootableContainerBlockEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.inventory.Inventories;
import net.minecraft.inventory.Inventory;
import net.minecraft.inventory.SidedInventory;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.predicate.entity.EntityPredicates;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.text.Text;
import net.minecraft.util.collection.DefaultedList;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;

public class ReinforcedHopperBlockEntity extends LootableContainerBlockEntity implements Hopper, SidedInventory {
	public static final int REGULAR_SLOTS = 7;
	public static final int SPEED_UPGRADE_SLOT = 7;
	public static final int BLOCK_UPGRADE_SLOT = 8;
	public static final int TOTAL_SLOTS = 9;
	private static final int[] AVAILABLE_SLOTS = new int[]{0, 1, 2, 3, 4, 5, 6};

	private DefaultedList<ItemStack> inventory = DefaultedList.ofSize(TOTAL_SLOTS, ItemStack.EMPTY);
	private int transferCooldown = -1;
	private long lastTickTime;
	private int transferCounter = 0;

	public ReinforcedHopperBlockEntity(BlockPos pos, BlockState state) {
		this(ModBlocks.REINFORCED_HOPPER_BLOCK_ENTITY, pos, state);
	}

	protected ReinforcedHopperBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
		super(type, pos, state);
	}

	public Direction getFacing() {
		BlockState state = this.getCachedState();
		if (state.contains(ReinforcedHopperBlock.FACING)) {
			return state.get(ReinforcedHopperBlock.FACING);
		}
		return Direction.DOWN;
	}

	public boolean isUpgraded() {
		ItemStack stack = this.inventory.get(SPEED_UPGRADE_SLOT);
		return !stack.isEmpty() && stack.isOf(ModItems.DIAMOND_UPGRADE);
	}

	public ItemStack getBlockUpgrade() {
		return this.inventory.get(BLOCK_UPGRADE_SLOT);
	}

	public int getChannelCount() {
		ItemStack blockStack = getBlockUpgrade();
		if (!blockStack.isEmpty()) {
			if (blockStack.getItem() instanceof com.reinforcedhopper.item.LaneUpgradeItem laneItem) {
				return laneItem.getLanes();
			}
			if (blockStack.isOf(ModItems.NETHERITE_LANE_UPGRADE)) {
				return 4;
			}
			if (blockStack.isOf(ModItems.DIAMOND_LANE_UPGRADE)) {
				return 3;
			}
			if (blockStack.isOf(ModItems.EMERALD_LANE_UPGRADE)) {
				return 2;
			}
		}
		return 1;
	}

	public int getCooldownDuration() {
		return isUpgraded() ? ModConfig.INSTANCE.upgradedCooldownTicks : ModConfig.INSTANCE.baseCooldownTicks;
	}

	@Override
	protected void readData(ReadView view) {
		super.readData(view);
		this.inventory = DefaultedList.ofSize(this.size(), ItemStack.EMPTY);
		if (!this.readLootTable(view)) {
			Inventories.readData(view, this.inventory);
		}
		this.transferCooldown = view.getInt("TransferCooldown", -1);
	}

	@Override
	protected void writeData(WriteView view) {
		super.writeData(view);
		if (!this.writeLootTable(view)) {
			Inventories.writeData(view, this.inventory);
		}
		view.putInt("TransferCooldown", this.transferCooldown);
	}

	@Override
	public int size() {
		return this.inventory.size();
	}

	@Override
	protected DefaultedList<ItemStack> getHeldStacks() {
		return this.inventory;
	}

	@Override
	protected void setHeldStacks(DefaultedList<ItemStack> inventory) {
		this.inventory = inventory;
	}

	@Override
	public ItemStack removeStack(int slot, int amount) {
		this.generateLoot(null);
		return Inventories.splitStack(this.getHeldStacks(), slot, amount);
	}

	@Override
	public void setStack(int slot, ItemStack stack) {
		this.generateLoot(null);
		this.getHeldStacks().set(slot, stack);
		stack.capCount(this.getMaxCount(stack));
	}

	@Override
	protected Text getContainerName() {
		return Text.translatable("container.reinforced_hopper");
	}

	@Override
	protected ScreenHandler createScreenHandler(int syncId, PlayerInventory playerInventory) {
		return new ReinforcedHopperScreenHandler(syncId, playerInventory, this);
	}

	// SidedInventory implementation - only expose regular 7 slots to automation
	@Override
	public int[] getAvailableSlots(Direction side) {
		return AVAILABLE_SLOTS;
	}

	@Override
	public boolean canInsert(int slot, ItemStack stack, @Nullable Direction side) {
		return slot < REGULAR_SLOTS;
	}

	@Override
	public boolean canExtract(int slot, ItemStack stack, Direction side) {
		return slot < REGULAR_SLOTS;
	}

	@Override
	public boolean isValid(int slot, ItemStack stack) {
		if (slot == SPEED_UPGRADE_SLOT) {
			return stack.isOf(ModItems.DIAMOND_UPGRADE);
		}
		if (slot == BLOCK_UPGRADE_SLOT) {
			return ReinforcedHopperBlockUpgradeSlot.isValidBlockUpgrade(stack);
		}
		return true;
	}

	public int getComparatorOutput() {
		int count = 0;
		float fullness = 0.0F;
		for (int i = 0; i < REGULAR_SLOTS; ++i) {
			ItemStack itemStack = this.getStack(i);
			if (!itemStack.isEmpty()) {
				fullness += (float)itemStack.getCount() / (float)Math.min(this.getMaxCount(itemStack), itemStack.getMaxCount());
				++count;
			}
		}
		fullness /= (float)REGULAR_SLOTS;
		return MathHelper.floor(fullness * 14.0F) + (count > 0 ? 1 : 0);
	}

	public static void serverTick(World world, BlockPos pos, BlockState state, ReinforcedHopperBlockEntity blockEntity) {
		blockEntity.transferCooldown--;
		blockEntity.lastTickTime = world.getTime();
		if (blockEntity.needsCooldown()) {
			blockEntity.setTransferCooldown(0);
			insertAndExtract(world, pos, state, blockEntity, () -> extract(world, blockEntity));
		}
	}

	protected static void insertAndExtract(World world, BlockPos pos, BlockState state, ReinforcedHopperBlockEntity blockEntity, BooleanSupplier booleanSupplier) {
		if (!world.isClient()) {
			if (blockEntity.needsCooldown() && isBlockEnabled(state)) {
				boolean bl = false;
				if (!blockEntity.isRegularEmpty()) {
					bl = insert(world, pos, blockEntity);
				}

				if (!blockEntity.isRegularFull()) {
					bl |= booleanSupplier.getAsBoolean();
				}

				if (bl) {
					blockEntity.setTransferCooldown(blockEntity.getCooldownDuration());
					markDirty(world, pos, state);
				}
			}
		}
	}

	protected static boolean isBlockEnabled(BlockState state) {
		return !state.contains(ReinforcedHopperBlock.ENABLED) || state.get(ReinforcedHopperBlock.ENABLED);
	}

	private boolean isRegularEmpty() {
		for (int i = 0; i < REGULAR_SLOTS; i++) {
			if (!this.inventory.get(i).isEmpty()) {
				return false;
			}
		}
		return true;
	}

	private boolean isRegularFull() {
		for (int i = 0; i < REGULAR_SLOTS; i++) {
			ItemStack itemStack = this.inventory.get(i);
			if (itemStack.isEmpty() || itemStack.getCount() != itemStack.getMaxCount()) {
				return false;
			}
		}
		return true;
	}

	public Direction getInputDirection() {
		return Direction.DOWN;
	}

	@Nullable
	public Inventory getOutputInventory(World world, BlockPos pos) {
		return getInventoryAt(world, pos.offset(getFacing()));
	}

	@Nullable
	public Inventory getInputInventory(World world) {
		BlockPos blockPos = BlockPos.ofFloored(this.getHopperX(), this.getHopperY() + 1.0, this.getHopperZ());
		BlockState blockState = world.getBlockState(blockPos);
		return getInventoryAt(world, this, blockPos, blockState);
	}

	private static boolean insert(World world, BlockPos pos, ReinforcedHopperBlockEntity blockEntity) {
		Inventory inventory = blockEntity.getOutputInventory(world, pos);
		if (inventory != null) {
			Direction direction = blockEntity.getFacing().getOpposite();
			int maxLanes = blockEntity.getChannelCount();
			List<Item> transferredTypes = new ArrayList<>();
			boolean anyTransferred = false;

			for (int i = 0; i < REGULAR_SLOTS && transferredTypes.size() < maxLanes; i++) {
				ItemStack itemStack = blockEntity.getStack(i);
				if (!itemStack.isEmpty()) {
					Item itemType = itemStack.getItem();
					if (!transferredTypes.contains(itemType)) {
						int count = itemStack.getCount();
						ItemStack transferStack = blockEntity.removeStack(i, 1);
						ItemStack remaining = transfer(blockEntity, inventory, transferStack, direction);
						if (remaining.isEmpty()) {
							transferredTypes.add(itemType);
							anyTransferred = true;
							inventory.markDirty();
						} else {
							itemStack.setCount(count);
							if (count == 1) {
								blockEntity.setStack(i, itemStack);
							}
						}
					}
				}
			}
			return anyTransferred;
		}
		return false;
	}

	public static boolean extract(World world, ReinforcedHopperBlockEntity hopper) {
		Inventory inventory = hopper.getInputInventory(world);
		if (inventory != null) {
			Direction direction = hopper.getInputDirection();
			int maxLanes = hopper.getChannelCount();
			List<Item> extractedTypes = new ArrayList<>();
			boolean anyExtracted = false;

			for (int slot : getAvailableSlotsFor(inventory, direction)) {
				if (extractedTypes.size() >= maxLanes) break;
				ItemStack itemStack = inventory.getStack(slot);
				if (!itemStack.isEmpty() && canExtract(hopper, inventory, itemStack, slot, direction)) {
					Item itemType = itemStack.getItem();
					if (!extractedTypes.contains(itemType)) {
						int count = itemStack.getCount();
						ItemStack transferStack = inventory.removeStack(slot, 1);
						ItemStack remaining = transfer(inventory, hopper, transferStack, null);
						if (remaining.isEmpty()) {
							extractedTypes.add(itemType);
							anyExtracted = true;
							inventory.markDirty();
						} else {
							itemStack.setCount(count);
							if (count == 1) {
								inventory.setStack(slot, itemStack);
							}
						}
					}
				}
			}
			return anyExtracted;
		} else {
			BlockPos blockPos = BlockPos.ofFloored(hopper.getHopperX(), hopper.getHopperY() + (hopper.getInputDirection() == Direction.UP ? -1.0 : 1.0), hopper.getHopperZ());
			BlockState blockState = world.getBlockState(blockPos);
			boolean bl = hopper.canBlockFromAbove() && blockState.isFullCube(world, blockPos) && !blockState.isIn(BlockTags.DOES_NOT_BLOCK_HOPPERS);
			if (!bl) {
				for (ItemEntity itemEntity : hopper.getItemEntitiesToSuck(world)) {
					if (extract(hopper, itemEntity)) {
						return true;
					}
				}
			}
		}
		return false;
	}

	public List<ItemEntity> getItemEntitiesToSuck(World world) {
		Box box = this.getInputAreaShape().offset(this.getHopperX() - 0.5, this.getHopperY() - 0.5, this.getHopperZ() - 0.5);
		return world.getEntitiesByClass(ItemEntity.class, box, EntityPredicates.VALID_ENTITY);
	}

	public static boolean extract(Inventory inventory, ItemEntity itemEntity) {
		boolean bl = false;
		ItemStack itemStack = itemEntity.getStack().copy();
		ItemStack itemStack2 = transfer(null, inventory, itemStack, null);
		if (itemStack2.isEmpty()) {
			bl = true;
			itemEntity.setStack(ItemStack.EMPTY);
			itemEntity.discard();
		} else {
			itemEntity.setStack(itemStack2);
		}
		return bl;
	}

	public static ItemStack transfer(@Nullable Inventory from, Inventory to, ItemStack stack, @Nullable Direction side) {
		if (to instanceof SidedInventory sidedInventory && side != null) {
			int[] is = sidedInventory.getAvailableSlots(side);
			for (int i = 0; i < is.length && !stack.isEmpty(); i++) {
				stack = transfer(from, to, stack, is[i], side);
			}
		} else {
			int max = to instanceof ReinforcedHopperBlockEntity ? REGULAR_SLOTS : to.size();
			for (int i = 0; i < max && !stack.isEmpty(); i++) {
				stack = transfer(from, to, stack, i, side);
			}
		}
		return stack;
	}

	private static boolean canInsert(Inventory inventory, ItemStack stack, int slot, @Nullable Direction side) {
		if (inventory instanceof ReinforcedHopperBlockEntity && slot >= REGULAR_SLOTS) {
			return false;
		}
		return inventory.isValid(slot, stack) && !(inventory instanceof SidedInventory sidedInventory && !sidedInventory.canInsert(slot, stack, side));
	}

	private static boolean canExtract(Inventory hopperInventory, Inventory fromInventory, ItemStack stack, int slot, Direction facing) {
		return fromInventory.canTransferTo(hopperInventory, slot, stack) && !(fromInventory instanceof SidedInventory sidedInventory && !sidedInventory.canExtract(slot, stack, facing));
	}

	private static ItemStack transfer(@Nullable Inventory from, Inventory to, ItemStack stack, int slot, @Nullable Direction side) {
		ItemStack itemStack = to.getStack(slot);
		if (canInsert(to, stack, slot, side)) {
			boolean bl = false;
			boolean bl2 = to.isEmpty();
			if (itemStack.isEmpty()) {
				to.setStack(slot, stack);
				stack = ItemStack.EMPTY;
				bl = true;
			} else if (canMergeItems(itemStack, stack)) {
				int i = stack.getMaxCount() - itemStack.getCount();
				int j = Math.min(stack.getCount(), i);
				stack.decrement(j);
				itemStack.increment(j);
				bl = j > 0;
			}

			if (bl) {
				if (bl2 && to instanceof ReinforcedHopperBlockEntity hopperBlockEntity && !hopperBlockEntity.isDisabled()) {
					int j = 0;
					if (from instanceof ReinforcedHopperBlockEntity hopperBlockEntity2 && hopperBlockEntity.lastTickTime >= hopperBlockEntity2.lastTickTime) {
						j = 1;
					}
					hopperBlockEntity.setTransferCooldown(hopperBlockEntity.getCooldownDuration() - j);
				}
				to.markDirty();
			}
		}
		return stack;
	}

	private static boolean canMergeItems(ItemStack first, ItemStack second) {
		return ItemStack.areItemsAndComponentsEqual(first, second);
	}

	protected static int[] getAvailableSlotsFor(Inventory inventory, Direction side) {
		if (inventory instanceof SidedInventory sidedInventory) {
			return sidedInventory.getAvailableSlots(side);
		} else {
			int size = inventory.size();
			int[] slots = new int[size];
			for (int i = 0; i < size; i++) {
				slots[i] = i;
			}
			return slots;
		}
	}

	@Nullable
	public static Inventory getInventoryAt(World world, BlockPos pos) {
		return getInventoryAt(world, pos, world.getBlockState(pos), pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5);
	}

	@Nullable
	public static Inventory getInventoryAt(World world, Hopper hopper, BlockPos pos, BlockState state) {
		return getInventoryAt(world, pos, state, hopper.getHopperX(), hopper.getHopperY() + 1.0, hopper.getHopperZ());
	}

	@Nullable
	public static Inventory getInventoryAt(World world, BlockPos pos, BlockState state, double x, double y, double z) {
		Inventory inventory = null;
		Block block = state.getBlock();
		if (block instanceof InventoryProvider inventoryProvider) {
			inventory = inventoryProvider.getInventory(state, world, pos);
		} else if (state.hasBlockEntity()) {
			net.minecraft.block.entity.BlockEntity blockEntity = world.getBlockEntity(pos);
			if (blockEntity instanceof Inventory inventory2) {
				inventory = inventory2;
				if (inventory instanceof ChestBlockEntity && block instanceof ChestBlock) {
					inventory = ChestBlock.getInventory((ChestBlock)block, state, world, pos, true);
				}
			}
		}

		if (inventory == null) {
			List<Entity> list = world.getOtherEntities(null, new Box(x - 0.5, y - 0.5, z - 0.5, x + 0.5, y + 0.5, z + 0.5), EntityPredicates.VALID_INVENTORIES);
			if (!list.isEmpty()) {
				inventory = (Inventory)list.get(world.random.nextInt(list.size()));
			}
		}

		return inventory;
	}

	public static void onEntityCollided(World world, BlockPos pos, BlockState state, Entity entity, ReinforcedHopperBlockEntity blockEntity) {
		if (entity instanceof ItemEntity itemEntity && !itemEntity.getStack().isEmpty() && entity.getBoundingBox().offset(-pos.getX(), -pos.getY(), -pos.getZ()).intersects(blockEntity.getInputAreaShape())) {
			insertAndExtract(world, pos, state, blockEntity, () -> extract(blockEntity, itemEntity));
		}
	}

	private boolean isDisabled() {
		return this.transferCooldown > 0;
	}

	public boolean needsCooldown() {
		return this.transferCooldown <= 0;
	}

	public void setTransferCooldown(int transferCooldown) {
		this.transferCooldown = transferCooldown;
	}

	@Override
	public double getHopperX() {
		return (double)this.pos.getX() + 0.5;
	}

	@Override
	public double getHopperY() {
		return (double)this.pos.getY() + 0.5;
	}

	@Override
	public double getHopperZ() {
		return (double)this.pos.getZ() + 0.5;
	}

	@Override
	public boolean canBlockFromAbove() {
		return true;
	}
}
