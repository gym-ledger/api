import { AppError } from "../../../../shared/errors/AppError.js";
import { addOneInTable, deleteOneFromTable, fetchOneFromTable, fetchPaginatedResultsFromTable, updateOneInTable } from "../../../index/index.repository.js";
import { isValidUUID } from "../../../../utils/validation.js";
import { PROGRESSION_RULES_TABLE, ProgressionRulesInterface } from "../../../../db/schemas/workoutPrograms/progressionRules.schema.js";

// exercises
export const listProgressionRulesForAdminService = async (data: { page?: number, limit?: number, search?: string, createdBy?: string }) => {
    const { page = 1, limit = 10 } = data;
    const progressionRules = await fetchPaginatedResultsFromTable({
        table: PROGRESSION_RULES_TABLE,
        where: [],

        limit,
        page,
    }) as {
        data: ProgressionRulesInterface[];
        meta: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
        };
    };
    return progressionRules;
}

export const viewProgressionRuleForAdminService = async (data: { id: string }) => {
    const { id } = data;

    if (!id) {
        throw new AppError("Progression rule id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid progression rule id", 400);
    }

    const progressionRule = await fetchOneFromTable({
        table: PROGRESSION_RULES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    }) as ProgressionRulesInterface;
    if (!progressionRule) {
        throw new AppError("Progression rule not found", 404);
    }
    return progressionRule;
}

export const createProgressionRuleForAdminService = async (data: { name: string, type: string, config: Record<string, unknown>, added_by_admin_user_id: string }) => {
    const { name, type, config, added_by_admin_user_id } = data;

    if (!name) {
        throw new AppError("Name is required", 400);
    }
    if (!type) {
        throw new AppError("Type is required", 400);
    }
    if (!config) {
        throw new AppError("Config is required", 400);
    }
    const duplicateByName = await fetchOneFromTable({
        table: PROGRESSION_RULES_TABLE,
        where: [{
            field: "name",
            operator: "=",
            value: name,
        }],
    }) as ProgressionRulesInterface;
    if (duplicateByName) {
        throw new AppError("Progression rule with this name already exists", 400);
    }

    const progressionRule = await addOneInTable({
        table: PROGRESSION_RULES_TABLE,
        data: { name, type, config, added_by_admin_user_id },
    }) as ProgressionRulesInterface;
    return progressionRule;
}

export const updateProgressionRuleForAdminService = async (data: { id: string, name: string, type: string, config: Record<string, unknown>, added_by_admin_user_id?: string }) => {
    const { id, name, type, config } = data;

    if (!id) {
        throw new AppError("Progression rule id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid progression rule id", 400);
    }

    const progressionRule = await fetchOneFromTable({
        table: PROGRESSION_RULES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    }) as ProgressionRulesInterface;
    if (!progressionRule) {
        throw new AppError("Progression rule not found", 404);
    }
    const toUpdate: Partial<ProgressionRulesInterface> = {};
    if (name) {
        const otherDuplicateByName = await fetchOneFromTable({
            table: PROGRESSION_RULES_TABLE,
            where: [{
                field: "name",
                operator: "=",
                value: name,
            }, {
                field: "id",
                operator: "!=",
                value: id,
            }],
        }) as ProgressionRulesInterface;
        if (otherDuplicateByName) {
            throw new AppError("Progression rule with this name already exists", 400);
        }
        toUpdate.name = name;
    }
    if (type) {
        toUpdate.type = type;
    }
    if (config) {
        toUpdate.config = config;
    }

    const updatedProgressionRule = await updateOneInTable({
        table: PROGRESSION_RULES_TABLE,
        data: toUpdate,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    }) as ProgressionRulesInterface;
    return updatedProgressionRule;
}
export const deleteProgressionRuleForAdminService = async (data: { id: string }) => {
    const { id } = data;

    if (!id) {
        throw new AppError("Progression rule id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid progression rule id", 400);
    }

    const progressionRule = await fetchOneFromTable({
        table: PROGRESSION_RULES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    }) as ProgressionRulesInterface;
    if (!progressionRule) {
        throw new AppError("Progression rule not found", 404);
    }
    await deleteOneFromTable({
        table: PROGRESSION_RULES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    });
    return progressionRule;
}