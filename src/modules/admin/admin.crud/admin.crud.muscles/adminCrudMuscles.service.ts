import { IMPORT_CONCURRENCY, mapWithConcurrency } from "../../../../utils/concurrency.js";
import { MUSCLES_TABLE, MusclesInterface } from "../../../../db/schemas/muscles/muscles.schema.js";
import { AppError } from "../../../../shared/errors/AppError.js";
import { isValidUUID } from "../../../../utils/validation.js";
import { addOneInTable, deleteOneFromTable, fetchManyFromTable, fetchOneFromTable, fetchPaginatedResultsFromTable, FetchPaginatedResultsFromTableParams, updateOneInTable } from "../../../index/index.repository.js";
import slugify from "slugify";
import { fetchHeirarchicalMusclesForAdminRepository, fetchOrderedMusclesForAdminRepository } from "./adminCrudMuscles.repository.js";
import { parseCsv } from "../../../../utils/csv.js";

export const listMusclesForAdminService = async (data: { page?: number, limit?: number, search?: string, parentsOnly?: boolean }) => {
    const { page = 1, limit = 10, search = "", parentsOnly = false } = data;

    const muscles = await fetchOrderedMusclesForAdminRepository({
        search,
        parentsOnly,
        page,
        limit,
    });
    return muscles;
}

export const viewMuscleForAdminService = async (id?: string) => {
    if (!id) {
        throw new AppError("Muscle id is required", 400);
    }
    if (!isValidUUID(id)) {
        throw new AppError("Invalid muscle id", 400);
    }
    const muscle = await fetchOneFromTable({
        table: MUSCLES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    }) as MusclesInterface;
    if (!muscle) {
        throw new AppError("Muscle not found", 404);
    }
    const parentMuscle = await fetchOneFromTable({
        table: MUSCLES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: muscle.parent_muscle_id,
        }],
    }) as MusclesInterface;
    const childrenMuscles = await fetchManyFromTable({
        table: MUSCLES_TABLE,
        where: [{
            field: "parent_muscle_id",
            operator: "=",
            value: muscle.id,
        }],
    }) as MusclesInterface[];
    return {
        muscle,
        parentMuscle,
        childrenMuscles,
    };
}

export const createMuscleForAdminService = async (data: {
    name: string,
    parent_muscle_id: string | null,
    xp_enabled: boolean,
    recovery_enabled: boolean,
    body_region: string | null,
    display_order: number,
    added_by_admin_user_id: string,
    children_muscles?: string[],
}) => {
    const {
        name,
        parent_muscle_id,
        xp_enabled,
        recovery_enabled,
        body_region,
        display_order,
        added_by_admin_user_id,
        children_muscles,
    } = data;
    if (!name) {
        throw new AppError("Name is required", 400);
    }
    const slug = slugify(name, { lower: true, strict: true });
    if (!slug) {
        throw new AppError("Failed to generate slug. Choose a different name.", 400);
    }
    const duplicateBySlug = await fetchOneFromTable({
        table: MUSCLES_TABLE,
        where: [{
            field: "slug",
            operator: "=",
            value: slug,
        }],
    }) as MusclesInterface;
    if (duplicateBySlug) {
        throw new AppError("Muscle with this slug already exists", 400);
    }
    if (parent_muscle_id && children_muscles && children_muscles.length > 0) {
        throw new AppError("A muscle cannot have both parent and children muscles", 400);
    }
    if (parent_muscle_id) {
        if (!isValidUUID(parent_muscle_id)) {
            throw new AppError("Invalid parent muscle id: " + parent_muscle_id, 400);
        } else {
            const parentMuscle = await fetchOneFromTable({
                table: MUSCLES_TABLE,
                where: [{
                    field: "id",
                    operator: "=",
                    value: parent_muscle_id,
                }],
            }) as MusclesInterface;
            if (!parentMuscle) {
                throw new AppError("Parent muscle not found", 404);
            }
        }
    }
    const muscle = await addOneInTable({
        table: MUSCLES_TABLE,
        data: {
            name,
            slug,
            parent_muscle_id,
            xp_enabled,
            recovery_enabled,
            body_region,
            display_order,
            added_by_admin_user_id
        },
    }) as MusclesInterface;
    if (!parent_muscle_id) {
        if (children_muscles && children_muscles.length > 0) {
            await Promise.all(children_muscles.map(async (child_muscle) => {
                if (!isValidUUID(child_muscle)) {
                    throw new AppError("Invalid child muscle id", 400);
                }
                const childMuscle = await fetchOneFromTable({
                    table: MUSCLES_TABLE,
                    where: [{ field: "id", operator: "=", value: child_muscle }],
                }) as MusclesInterface;
                if (!childMuscle) {
                    throw new AppError("Child muscle not found", 404);
                }
                await updateOneInTable({
                    table: MUSCLES_TABLE,
                    data: { parent_muscle_id: muscle.id },
                    where: [{ field: "id", operator: "=", value: child_muscle }],
                });
            }));
        }
    }
    return muscle;
}

export const updateMuscleForAdminService = async (data: {
    id: string,
    name: string,
    parent_muscle_id: string | null,
    xp_enabled: boolean,
    recovery_enabled: boolean,
    body_region: string | null,
    display_order: number,
    added_by_admin_user_id: string,
    children_muscles?: string[]
}) => {
    const {
        id,
        name,
        parent_muscle_id,
        xp_enabled,
        recovery_enabled,
        body_region,
        display_order,
        added_by_admin_user_id,
        children_muscles,
    } = data;
    if (!id) {
        throw new AppError("Muscle id is required", 400);
    }
    if (!isValidUUID(id)) {
        throw new AppError("Invalid muscle id", 400);
    }
    if (!name) {
        throw new AppError("Name is required", 400);
    }
    const slug = slugify(name, { lower: true, strict: true });
    if (!slug) {
        throw new AppError("Failed to generate slug. Choose a different name.", 400);
    }
    const duplicateBySlug = await fetchOneFromTable({
        table: MUSCLES_TABLE,
        where: [{
            field: "slug",
            operator: "=",
            value: slug,
        }],
    }) as MusclesInterface;
    if (duplicateBySlug) {
        throw new AppError("Muscle with this slug already exists", 400);
    }
    if (parent_muscle_id && children_muscles && children_muscles.length > 0) {
        throw new AppError("A muscle cannot have both parent and children muscles", 400);
    }
    if (parent_muscle_id) {
        if (!isValidUUID(parent_muscle_id)) {
            throw new AppError("Invalid parent muscle id: " + parent_muscle_id, 400);
        }
        const parentMuscle = await fetchOneFromTable({
            table: MUSCLES_TABLE,
            where: [{ field: "id", operator: "=", value: parent_muscle_id }],
        }) as MusclesInterface;
        if (!parentMuscle) {
            throw new AppError("Parent muscle not found", 404);
        }
    }
    const existsMuscle = await fetchOneFromTable({
        table: MUSCLES_TABLE,
        where: [{ field: "id", operator: "=", value: id }],
    }) as MusclesInterface;
    if (!existsMuscle) {
        throw new AppError("Muscle not found", 404);
    }
    const muscle = await updateOneInTable({
        table: MUSCLES_TABLE,
        data: {
            name,
            slug,
            parent_muscle_id,
            xp_enabled,
            recovery_enabled,
            body_region,
            display_order,
            added_by_admin_user_id
        },
        where: [{ field: "id", operator: "=", value: id }],
    }) as MusclesInterface;
    if (!parent_muscle_id) {
        if (children_muscles && children_muscles.length > 0) {
            await Promise.all(children_muscles.map(async (child_muscle) => {
                if (!isValidUUID(child_muscle)) {
                    throw new AppError("Invalid child muscle id", 400);
                }
                const childMuscle = await fetchOneFromTable({
                    table: MUSCLES_TABLE,
                    where: [{ field: "id", operator: "=", value: child_muscle }],
                }) as MusclesInterface;
                if (!childMuscle) {
                    throw new AppError("Child muscle not found", 404);
                }
                await updateOneInTable({
                    table: MUSCLES_TABLE,
                    data: { parent_muscle_id: muscle.id },
                    where: [{ field: "id", operator: "=", value: child_muscle }],
                });
            }));
        }
    }
    return muscle;
}
export const deleteMuscleForAdminService = async (id: string) => {
    if (!id) {
        throw new AppError("Muscle id is required", 400);
    }
    if (!isValidUUID(id)) {
        throw new AppError("Invalid muscle id", 400);
    }
    const existsMuscle = await fetchOneFromTable({
        table: MUSCLES_TABLE,
        where: [{ field: "id", operator: "=", value: id }],
    }) as MusclesInterface;
    if (!existsMuscle) {
        throw new AppError("Muscle not found", 404);
    }
    const muscle = await deleteOneFromTable({
        table: MUSCLES_TABLE,
        where: [{ field: "id", operator: "=", value: id }],
    });
    return muscle;
}

export const getMusclesDropdownForAdminService = async (data: { page?: number, limit?: number, search?: string, sendInHierarchy?: boolean }) => {
    const { page = 1, limit = 10, search = "", sendInHierarchy = false } = data;
    const whereParams: FetchPaginatedResultsFromTableParams['where'] = search.trim()
        ? [{ field: "name", operator: "ILIKE", value: `%${search.trim()}%` }]
        : [];
    if (sendInHierarchy) {
        whereParams.push({ field: "parent_muscle_id", operator: "!=", value: null });
    }
    const selectParams: FetchPaginatedResultsFromTableParams['select'] = ["id", "name"];
    if (sendInHierarchy) {
        const muscles = await fetchHeirarchicalMusclesForAdminRepository({ search, page, limit });
        return muscles;
    } else {
        selectParams.push("parent_muscle_id");
        const muscles = await fetchPaginatedResultsFromTable({
            table: MUSCLES_TABLE,
            where: whereParams,
            select: selectParams,
            page,
            limit,
        }) as {
            data: MusclesInterface[];
            meta: {
                page: number;
                limit: number;
                totalCount: number;
                totalPages: number;
            };
        };
        return muscles;
    }
}

export const importMusclesForAdminService = async (data: { file: Express.Multer.File, added_by_admin_user_id: string }) => {
    const { file, added_by_admin_user_id } = data;
    if (!file) {
        throw new AppError("File is required", 400);
    }
    const errors: {
        row: number;
        message: string;
    }[] = [];
    const muscles = await parseCsv({
        buffer: file.buffer, mapRow: (row) => {
            return {
                tempId: row.tempId || null,
                id: row.id || null,
                name: row.name || '',
                parent_muscle_id: row.parent_muscle_id || null,
                xp_enabled: row.xp_enabled === 'true',
                recovery_enabled: row.recovery_enabled === 'true',
                body_region: row.body_region || null,
                display_order: parseInt(row.display_order),
                children_muscles: row.children_muscles ? JSON.parse(row.children_muscles) : [],
            };
        }
    }) as {
        tempId: string | null;
        id: string | null;
        name: string;
        parent_muscle_id: string | null;
        xp_enabled: boolean;
        recovery_enabled: boolean;
        body_region: string | null;
        display_order: number;
        children_muscles: string[];
    }[];
    const processedData: { muscle: MusclesInterface, tempId: string | null }[] = [];
    const pendingData: { id: string, parent_muscle_id: string | null, children_muscles: string[] }[] = [];
    await mapWithConcurrency(muscles, IMPORT_CONCURRENCY, async (muscle) => {
        try {
            const payloadToSave = {
                ...muscle
            } as unknown as MusclesInterface;
            if (muscle.parent_muscle_id && !isValidUUID(muscle.parent_muscle_id)) {
                payloadToSave.parent_muscle_id = null;
            }
            if (muscle.children_muscles && muscle.children_muscles.length > 0) {
                if (muscle.children_muscles.some(child_muscle => !isValidUUID(child_muscle))) {
                    payloadToSave.children_muscles = [];
                }
            }
            let savedData: MusclesInterface | null = null;
            if (muscle.id) {
                savedData = await updateMuscleForAdminService(payloadToSave as MusclesInterface);
            } else {
                savedData = await createMuscleForAdminService({ ...payloadToSave, added_by_admin_user_id } as unknown as MusclesInterface);
            }
            processedData.push({ muscle: savedData, tempId: muscle.tempId });
            if (!savedData) {
                throw new AppError("Failed to save muscle", 500);
            }
            if (muscle.parent_muscle_id && !isValidUUID(muscle.parent_muscle_id)) {
                pendingData.push({ id: savedData.id, parent_muscle_id: muscle.parent_muscle_id, children_muscles: [] });
            }
            if (muscle.children_muscles && muscle.children_muscles.length > 0) {
                if (muscle.children_muscles.some(child_muscle => !isValidUUID(child_muscle))) {
                    pendingData.push({ id: savedData.id, parent_muscle_id: null, children_muscles: muscle.children_muscles });
                }
            }
        } catch (error) {
            errors.push({
                row: muscle.id ? muscles.indexOf(muscle) + 1 : muscles.length + 1,
                message: error instanceof AppError ? error.message : "Unknown error",
            });
        }
    });
    await mapWithConcurrency(pendingData, IMPORT_CONCURRENCY, async (muscle) => {
        try {
            if (!muscle.id) {
                throw new AppError("Muscle id is required", 400);
            }
            if (!isValidUUID(muscle.id)) {
                throw new AppError("Invalid muscle id", 400);
            }
            if (muscle.parent_muscle_id) {
                let parentMuscleId: string | null = null;
                if (!isValidUUID(muscle.parent_muscle_id)) {
                    const data = processedData.find((data) => data.tempId === muscle.parent_muscle_id);
                    if (!data) {
                        // console.log(processedData);
                        // console.log(muscle.parent_muscle_id);
                        throw new AppError("Parent muscle not found", 404);
                    }
                    parentMuscleId = data.muscle.id;
                } else {
                    const parentMuscle = await fetchOneFromTable({
                        table: MUSCLES_TABLE,
                        where: [{ field: "id", operator: "=", value: muscle.parent_muscle_id }],
                    }) as MusclesInterface;
                    if (!parentMuscle) {
                        throw new AppError("Parent muscle not found", 404);
                    }
                    parentMuscleId = parentMuscle.id;
                }
                await updateOneInTable({
                    table: MUSCLES_TABLE,
                    where: [
                        { field: "id", operator: "=", value: muscle.id },
                    ],
                    data: {
                        parent_muscle_id: parentMuscleId,
                    },
                });
            }

        } catch (error) {
            errors.push({
                row: pendingData.indexOf(muscle) + 1,
                message: error instanceof AppError ? error.message : "Unknown error",
            });
        }

    });

    return { errors, success: processedData.length, totalErrors: errors.length };
}

export const exportMusclesForAdminService = async (data: {
    search?: string,
}) => {
    const { search = "" } = data;
    const dataToSend = await fetchManyFromTable({
        table: MUSCLES_TABLE,
        where: search.trim()
            ? [{ field: "name", operator: "ILIKE", value: `%${search.trim()}%` }]
            : [],
    }) as MusclesInterface[];
    return dataToSend;
}