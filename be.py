import random
from itertools import combinations

# Define the card deck
suits = 'cdhs'  # clubs, diamonds, hearts, spades
ranks = '23456789TJQKA'
deck = [r + s for r in ranks for s in suits]


def deal_hands(num_hands, cards_per_hand=5):
    global deck  # Ensure deck is accessible and can be modified
    random.shuffle(deck)
    hands = []
    for _ in range(num_hands):
        hand = []
        for _ in range(cards_per_hand):
            hand.append(deck.pop())  # Remove and append the last card of the deck
        hands.append(hand)
    return hands


def evaluate_high_hand(hand):
    ranks = {'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
             'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14}

    parsed_hand = []
    for card in hand:
        if card.startswith('10'):
            rank = 'T'  # Replace '10' with 'T'
            suit = card[2]
        else:
            rank = card[0].upper()  # Make sure rank is uppercase
            suit = card[1].upper()
        parsed_hand.append((ranks[rank], suit))

    parsed_hand = sorted(parsed_hand, reverse=True)

    rank_histogram = {}
    suit_histogram = {}
    for rank, suit in parsed_hand:
        rank_histogram[rank] = rank_histogram.get(rank, 0) + 1
        suit_histogram[suit] = suit_histogram.get(suit, 0) + 1

    is_flush = any(count >= 5 for count in suit_histogram.values())
    is_straight = False
    rank_sorted = sorted(rank_histogram.keys(), reverse=True)
    for i in range(len(rank_sorted) - 4):
        if rank_sorted[i] - rank_sorted[i + 4] == 4:
            is_straight = True
            break
    if not is_straight and {14, 5, 4, 3, 2}.issubset(set(rank_histogram.keys())):
        is_straight = True  # Ace can be low in a 5-high straight

    most_common = sorted(((count, rank) for rank, count in rank_histogram.items()), reverse=True)

    score = 0
    if is_flush and is_straight:
        score = 8000 + rank_sorted[0]  # Add top card rank to differentiate straight flushes
    elif most_common[0][0] == 4:
        score = 7000 + most_common[0][1]
    elif most_common[0][0] == 3 and most_common[1][0] >= 2:
        score = 6000 + most_common[0][1] * 100 + most_common[1][1]  # Higher weight to three-of-a-kind
    elif is_flush:
        score = 5000 + rank_sorted[0]  # Top card of the flush
    elif is_straight:
        score = 4000 + rank_sorted[0]  # Top card of the straight
    elif most_common[0][0] == 3:
        score = 3000 + most_common[0][1]
    elif most_common[0][0] == 2 and most_common[1][0] == 2:
        score = 2000 + most_common[0][1] * 100 + most_common[1][1]
    elif most_common[0][0] == 2:
        score = 1000 + most_common[0][1]
    else:
        score = rank_sorted[0]

    return score


def evaluate_low_hand(hand):
    ranks = {'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
             '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13}
    
    # Adjust parsing to correctly handle '10' cards and normalize rank to uppercase
    ranks_only = []
    for card in hand:
        if card.startswith('10'):
            rank = 'T'  # Replace '10' with 'T'
            suit = card[2:]
        else:
            rank = card[0].upper()  # Convert rank to uppercase to match dictionary keys
            suit = card[1:].upper()
        if rank in ranks and ranks[rank] <= 8:
            ranks_only.append(ranks[rank])

    if len(ranks_only) < 5:
        return None  # Not enough low cards to qualify

    # Create a sorted list of unique low card ranks
    unique_low_ranks = sorted(set(ranks_only))
    
    if len(unique_low_ranks) < 5:
        return None  # Not enough unique low ranks

    # Calculate a numerical score by constructing a reverse score
    # Lower scores are better, so we sort the ranks to score lower for lower values
    score = 0
    multiplier = 1
    for rank in sorted(unique_low_ranks):
        score += rank * multiplier
        multiplier *= 10

    return score


# # Example usage:
# hero_hand = ['2h', '3h', '4h', '5h', '9h']  # Straight flush
# print(f"Hand score: {evaluate_high_hand(hero_hand)}")
# hero_hand = ['2h', '3h', '10h', '10s', '10d']  # three 10s
# print(f"Hand score: {evaluate_high_hand(hero_hand)}")

# # Example usage:
# hand = ['2h', '3h', '4h', '5h', 'as']  # Valid low hand
# print(f"Low hand score: {evaluate_low_hand(hand)}")

# hand = ['2h', '9h', '4h', '5h', '7s']  # Invalid low hand, contains a 9
# print(f"Low hand score: {evaluate_low_hand(hand)}")

# hand = ['Ah', '2c', '3s', '4d', '5h']  # Wheel, the best low hand
# print(f"Low hand score: {evaluate_low_hand(hand)}")
hero_hand = ['2h', '3h', '4h', '5h', '9h']
villain_hand = ['kh', 'ks', 'ah', 'as', 'jh']
board = ['10h', '10s', '10d', '6d', '6d']


def find_best_hands(hero_hand, villain_hand, board):
    # Generate all possible 5-card hands for high and low evaluations
    def generate_hands(player_hand):
        all_combos = []
        # Generate all combinations of 2 hole cards and 3 board cards
        for hole_cards in combinations(player_hand, 2):
            for board_cards in combinations(board, 3):
                all_combos.append(list(hole_cards + board_cards))
        return all_combos

    hero_combos = generate_hands(hero_hand)
    villain_combos = generate_hands(villain_hand)

    return hero_combos, villain_combos


def evaluate_and_compare(hero_combos, villain_combos):
    best_hero_high_score = -1
    best_villain_high_score = -1
    best_hero_low_score = float('inf')
    best_villain_low_score = float('inf')

    for combo in hero_combos:
        high_score = evaluate_high_hand(combo)
        low_score = evaluate_low_hand(combo)
        if high_score > best_hero_high_score:
            best_hero_high_score = high_score
        if low_score and low_score < best_hero_low_score:
            best_hero_low_score = low_score

    for combo in villain_combos:
        high_score = evaluate_high_hand(combo)
        low_score = evaluate_low_hand(combo)
        if high_score > best_villain_high_score:
            best_villain_high_score = high_score
        if low_score and low_score < best_villain_low_score:
            best_villain_low_score = low_score

    # Determine the winners
    high_winner = "Hero" if best_hero_high_score > best_villain_high_score else (
        "Split" if best_hero_high_score == best_villain_high_score else "Villain")
    low_winner = None
    if best_hero_low_score < float('inf') or best_villain_low_score < float('inf'):
        if best_hero_low_score < best_villain_low_score:
            low_winner = "Hero"
        elif best_hero_low_score == best_villain_low_score:
            low_winner = "Split"
        else:
            low_winner = "Villain"

    stats = True
    if stats:
        print(f"High hand winner: {high_winner} (Hero: {best_hero_high_score}, Villain: {best_villain_high_score})")
        print(f"Low hand winner: {low_winner} (Hero: {best_hero_low_score if best_hero_low_score < float('inf') else 'No qualifying low'}, Villain: {best_villain_low_score if best_villain_low_score < float('inf') else 'No qualifying low'})")

    return high_winner, low_winner, best_hero_high_score, best_villain_high_score, best_hero_low_score, best_villain_low_score


# hero_hand = ['2h', '3h', '4h', '5h', '9h']
# villain_hand = ['kh', 'ks', 'ah', 'js', 'jh']
# board = ['10h', '10s', '10d', '6d', '6d']

# hero_combos, villain_combos = find_best_hands(hero_hand, villain_hand, board)
# high_winner, low_winner, best_hero_high_score, best_villain_high_score, best_hero_low_score, best_villain_low_score = evaluate_and_compare(
#     hero_combos, villain_combos)


# hero_hand = ['2h', '3h', '4h', 'ad', 'ac']
# villain_hand = ['kh', 'ks', 'ah', 'as', 'jh']
# board = ['10h', '10s', '10d', '6d', '6d']

# hero_combos, villain_combos = find_best_hands(hero_hand, villain_hand, board)
# high_winner, low_winner, best_hero_high_score, best_villain_high_score, best_hero_low_score, best_villain_low_score = evaluate_and_compare(
#     hero_combos, villain_combos)

# hero_hand = ['2h', '3h', '4h', 'ad', 'ac']
# villain_hand = ['kh', 'ks', 'ah', '3s', '2h']
# board = ['7h', '6s', '8d', '6d', '6d']

# hero_combos, villain_combos = find_best_hands(hero_hand, villain_hand, board)
# high_winner, low_winner, best_hero_high_score, best_villain_high_score, best_hero_low_score, best_villain_low_score = evaluate_and_compare(
#     hero_combos, villain_combos)

# hero_hand = ['2h', '5h', '4h', 'ad', 'ac']
# villain_hand = ['kh', 'ks', 'ah', '3s', '4h']
# board = ['2h', '6s', '8d', '6d', '6d']

# hero_combos, villain_combos = find_best_hands(hero_hand, villain_hand, board)
# high_winner, low_winner, best_hero_high_score, best_villain_high_score, best_hero_low_score, best_villain_low_score = evaluate_and_compare(
#     hero_combos, villain_combos)


# hero_hand = ['2h', '5h', '4h', 'ad', 'ac']
# villain_hand = ['kh', 'ks', 'ah', '3s', '4h']
# board = ['2h', '6s', '8d']

import random
from itertools import combinations

def remaining_deck(hero_hand, villain_hand, board):
    all_cards = set([r + s for r in '23456789TJQKA' for s in 'cdhs'])
    used_cards = set(hero_hand + villain_hand + board)
    return list(all_cards - used_cards)

def simulate_board(hero_hand, villain_hand, board, simulations=10000):
    hero_wins = 0
    villain_wins = 0
    splits = 0
    remaining_deck_cards = remaining_deck(hero_hand, villain_hand, board)
    cards_to_deal = 5 - len(board)

    for _ in range(simulations):
        random.shuffle(remaining_deck_cards)
        complete_board = board + remaining_deck_cards[:cards_to_deal]  # Complete the board
        
        hero_combos = generate_hands(hero_hand, complete_board)
        villain_combos = generate_hands(villain_hand, complete_board)
        
        best_hero_high_score = max(evaluate_high_hand(combo) for combo in hero_combos)
        best_villain_high_score = max(evaluate_high_hand(combo) for combo in villain_combos)

        if best_hero_high_score > best_villain_high_score:
            hero_wins += 1
        elif best_hero_high_score < best_villain_high_score:
            villain_wins += 1
        else:
            splits += 1
        if cards_to_deal == 0:
            simulations = 1
            break

    print(f"Hero wins: {hero_wins/simulations*100:.2f}%")
    print(f"Villain wins: {villain_wins/simulations*100:.2f}%")
    print(f"Splits: {splits/simulations*100:.2f}%")

def generate_hands(player_hand, board):
    all_combos = []
    for hole_cards in combinations(player_hand, 2):
        for board_cards in combinations(board, 3):
            all_combos.append(list(hole_cards + board_cards))
    return all_combos

# Example usage for various board stages:
hero_hand = ['ad', 'ac', 'qd', 'jc', '2d']
villain_hand = ['as', '2c', '5c', '7s', '10s']

# No board cards
board=[]
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)

# Three board cards dealt
board=['4c', '8h', '2d']
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)

# Four board cards dealt
board=['4c', '8h', '2d','5h']
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)

# Full board
board=['4c', '8h', '2d','5h','10h']
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)

