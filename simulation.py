
import random
from itertools import combinations
from evaluation import evaluate_and_compare


def remaining_deck(hero_hand, villain_hand, board):
    all_cards = set([r + s for r in '23456789TJQKA' for s in 'cdhs'])
    used_cards = set(hero_hand + villain_hand + board)
    return list(all_cards - used_cards)


def generate_hands(player_hand, board):
    all_combos = []
    for hole_cards in combinations(player_hand, 2):
        for board_cards in combinations(board, 3):
            all_combos.append(list(hole_cards + board_cards))
    return all_combos


def simulate_board(hero_hand, villain_hand, board, simulations=10000):
    hero_wins_high = 0
    villain_wins_high = 0
    splits_high = 0

    hero_wins_low = 0
    villain_wins_low = 0
    splits_low = 0
    no_low = 0

    hero_scoop = 0
    villain_scoop = 0
    no_scoop = 0

    ns_hero_wins_high = 0
    ns_villain_wins_high = 0
    ns_splits_high = 0
    ns_hero_wins_low = 0
    ns_villain_wins_low = 0
    ns_splits_low = 0
    ns_no_low = 0

    hero_ev = 0

    remaining_deck_cards = remaining_deck(hero_hand, villain_hand, board)
    cards_to_deal = 5 - len(board)

    for _ in range(simulations):
        random.shuffle(remaining_deck_cards)
        complete_board = board + remaining_deck_cards[:cards_to_deal]  # Complete the board

        hero_combos = generate_hands(hero_hand, complete_board)
        villain_combos = generate_hands(villain_hand, complete_board)

        high_winner, low_winner, _, _, _, _ = evaluate_and_compare(hero_combos, villain_combos)
        is_no_scoop = False

        if high_winner == "Hero":
            hero_wins_high += 1
        elif high_winner == "Villain":
            villain_wins_high += 1
        else:
            splits_high += 1

        if low_winner == "Hero":
            hero_wins_low += 1
        elif low_winner == "Villain":
            villain_wins_low += 1
        elif low_winner == None:
            no_low += 1
        else:
            splits_low += 1

        if high_winner == "Hero" and (low_winner == "Hero" or low_winner == None):
            hero_scoop += 1
        elif high_winner == "Villain" and (low_winner == "Villain" or low_winner == None):
            villain_scoop += 1
        else:
            is_no_scoop = True
            no_scoop += 1

        if is_no_scoop is True:
            if high_winner == "Hero":
                ns_hero_wins_high += 1
            elif high_winner == "Villain":
                ns_villain_wins_high += 1
            else:
                ns_splits_high += 1

            if low_winner == "Hero":
                ns_hero_wins_low += 1
            elif low_winner == "Villain":
                ns_villain_wins_low += 1
            elif low_winner == None:
                ns_no_low += 1
            else:
                ns_splits_low += 1

    hero_ev = (hero_scoop/simulations)+((no_scoop/simulations)*(0.5*ns_hero_wins_high/no_scoop) + (0.25*ns_splits_high /
                                                                                     no_scoop) + (0.5*ns_hero_wins_low/no_scoop)+(0.25*ns_splits_low/no_scoop))
    # print(
    #     f"High hand - Hero wins: {hero_wins_high/simulations*100:.2f}%, Villain wins: {villain_wins_high/simulations*100:.2f}%, Splits: {splits_high/simulations*100:.2f}%")
    # print(
    #     f"Low hand - Hero wins: {hero_wins_low/simulations*100:.2f}%, Villain wins: {villain_wins_low/simulations*100:.2f}%, Splits: {splits_low/simulations*100:.2f}%, No Low: {no_low/simulations*100:.2f}%")
    print('\n')
    print(
        f"Scoop - Hero Scoops: {hero_scoop/simulations*100:.2f}%, Villain Scoops: {villain_wins_high/simulations*100:.2f}%, No Scoop: {no_scoop/simulations*100:.2f}%")
    
    print("\nWHEN NO SCOOP:")
    print(
        f"High hand - Hero wins: {ns_hero_wins_high/no_scoop*100:.2f}%, Villain wins: {ns_villain_wins_high/no_scoop*100:.2f}%, Splits: {ns_splits_high/no_scoop*100:.2f}%")
    print(
        f"Low hand - Hero wins: {ns_hero_wins_low/no_scoop*100:.2f}%, Villain wins: {ns_villain_wins_low/no_scoop*100:.2f}%, Splits: {ns_splits_low/no_scoop*100:.2f}%, No Low: {ns_no_low/no_scoop*100:.2f}%")
    print('\n')

    print(f'Total Hero Equity: {hero_ev:.3f}%\n\n')