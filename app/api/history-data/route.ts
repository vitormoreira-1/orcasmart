import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Period, Timeframe } from '../../../lib/types';
import prisma from "@/lib/prisma";
import { getDaysInMonth } from "date-fns";
import { NextResponse } from "next/server";

const getHistoryDataSchema = z.object({
    timeframe: z.enum(['month', 'year']),
    month: z.coerce.number().min(0).max(11).default(0),
    year: z.coerce.number().min(2000).max(3000),
})

export async function GET(request: Request) {
    debugger
    // Valida se o usuário está autenticado (exemplo de NextAuth)
    const user = await currentUser(); // Função fictícia de exemplo

    if (!user) {
        return NextResponse.redirect('/sign-in');
    }

    // Extraindo os parâmetros da URL
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    // Validação dos parâmetros usando Zod
    const queryParams = getHistoryDataSchema.safeParse({
        timeframe,
        year,
        month,
    });

    if (!queryParams.success) {
        return NextResponse.json({ error: queryParams.error.message }, { status: 400 });
    }

    const { timeframe: validTimeframe, year: validYear, month: validMonth } = queryParams.data;

    // Chama a função para buscar os dados de transação
    const data = await getTransactionHistory(user.id, validTimeframe, {
        year: validYear,
        month: validMonth,
    });

    // Retorna a resposta como JSON
    return NextResponse.json(data);
}

export type GetHisotryDataResponseType = Awaited<ReturnType<typeof getTransactionHistory>>

async function getTransactionHistory(userId: string, timeframe: 'month' | 'year', period: { year: number, month?: number }) {
    if (timeframe === 'year') {
        return await getYearHistoryData(userId, period.year);
    } else if (timeframe === 'month' && period.month !== undefined) {
        return await getMonthHistoryData(userId, period.year, period.month);
    } else {
        throw new Error('Month must be provided for monthly timeframe');
    }
}

type HistoryData = {
    expense: number,
    income: number,
    year: number,
    month: number,
    day?: number,
    monthBalance?: number,
}

async function getYearHistoryData(userId: string, year: number){
    const result = await prisma.yearHistory.groupBy({
        by: ['month'],
        where: {
            userID: userId,
            year
        },
        _sum: {
            expense: true,
            income: true,
        },
        orderBy: [
            {
                month: 'asc'
            }
        ]
    })

    if(!result || result.length === 0){
        return []
    }

    const history: HistoryData[] = []

    for (let i = 0; i < 12; i++){
        let expense = 0
        let income = 0

        const month = result.find((row) => row.month === i)
        if(month){
            expense = month._sum.expense || 0;
            income = month._sum.income || 0;
        }

        history.push({
            year,
            month: i,
            expense,
            income,
        })
    }

    return history
}


async function getMonthHistoryData(userId: string, year: number, month: number) {
    const result = await prisma.monthHistory.groupBy({
        by: ['day'],
        where: {
            userID: userId,
            year,
            month,
        },
        _sum: {
            expense: true,
            income: true,
        },
        orderBy: [
            {
                day: 'asc'
            }
        ]
    });

    if (!result || result.length === 0) {
        return [];
    }

    const history: HistoryData[] = [];
    const daysInMonth = getDaysInMonth(new Date(year, month));
    let accumulatedBalance = 0; // Variável para armazenar o saldo acumulado

    for (let i = 1; i <= daysInMonth; i++) {
        let expense = 0;
        let income = 0;

        const day = result.find((row) => row.day === i);

        if (day) {
            expense = day._sum.expense || 0;
            income = day._sum.income || 0;
        }

        // Atualiza o saldo acumulado até o dia atual
        accumulatedBalance += income - expense;

        history.push({
            expense,
            income,
            year,
            month,
            day: i,
            monthBalance: accumulatedBalance // Saldo acumulado do mês até este dia
        });
    }

    return history;
}