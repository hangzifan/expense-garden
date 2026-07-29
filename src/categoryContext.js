import { createContext } from "react";
import { categories, incomeCategories } from "./data.js";

export const ExpenseCategoriesContext = createContext(categories);
export const IncomeCategoriesContext = createContext(incomeCategories);

